import { ecefToGeodetic } from "../science/geodesy.js";
import { SampledTemeTrajectory } from "../traffic/trajectory.js";
import type { Launch } from "../types.js";
import {
  airAtAltitude, ecefToTemeApprox, engineAt, gravityEcefMps2,
  guidanceAt, launchSiteEcefM, localEnu, magnitude, minus, plus,
  STANDARD_G0, EARTH_OMEGA_RAD_S, thrustUnitEcef, times,
  toVector, twoBodyOrbitEstimate, windEcefMps,
  type V3,
} from "./physics.js";
import type {
  AscentEvent, AscentEventKind, AscentSample, AscentSimulationResult,
  AscentStage, AscentSummary, LaunchScenarioInput, LaunchSimulationOptions,
  LaunchVehicle,
} from "./types.js";

interface IntegrationState { p:V3; v:V3; propKg:number; }
interface Derivative { p:V3; v:V3; propKg:number; }
interface StageContext { stageIndex:number; powered:boolean; fairingAttached:boolean; }
interface Aero {
  pressurePa:number; densityKgM3:number; speedOfSoundMps:number;
  airRelative:V3; airspeedMps:number; qPa:number; altitudeM:number;
}

const EPS=1e-7;

/** Educational / preliminary 3DOF point-mass launch simulation, not a flight dynamics product. */
export class LaunchDynamicsEngine {
  simulate(options:LaunchSimulationOptions):AscentSimulationResult {
    validate(options);
    const {site,vehicle,liftoff,guidance}=options;
    const environment=options.environment??{};
    const dtMax=options.stepSeconds??1;
    const finalT=options.durationSeconds;
    const maxSamples=options.maxSamples??100_000;
    const events:AscentEvent[]=[];
    const samples:AscentSample[]=[];

    const originalMassKg=totalMass(vehicle,0,vehicle.stages[0]!.propellantMassKg,true);
    let y:IntegrationState={p:launchSiteEcefM(site),v:[0,0,0],propKg:vehicle.stages[0]!.propellantMassKg};
    let t=0;
    let stageIndex=0;
    const flight:{current:"powered"|"coast"|"complete"}={current:"powered"};
    let fairingAttached=(vehicle.fairingMassKg??0)>0;
    let nextIgnitionTime=Number.POSITIVE_INFINITY;
    let termination:"duration"|"impact"="duration";

    const dateAt=(seconds:number)=>new Date(liftoff.getTime()+seconds*1000);
    const massNow=()=>totalMass(vehicle,stageIndex,y.propKg,fairingAttached);

    const recordEvent=(kind:AscentEventKind,details?:string,stage?:string)=>{
      const loc=ecefToGeodetic(y.p);
      const event:AscentEvent={
        kind,time:dateAt(t),tSeconds:t,
        massKg:massNow(),altitudeM:loc.altitudeM,
      };
      if(details!==undefined)event.details=details;
      if(stage!==undefined)event.stageName=stage;
      events.push(event);
    };

    const sample=():AscentSample=>{
      const at=dateAt(t);
      const location=ecefToGeodetic(y.p);
      const aero=aerodynamics(y,environment);
      const stage=vehicle.stages[stageIndex]!;
      const control=guidanceAt(guidance,t);
      const thrust=flight.current==="powered"?engineAt(stage,aero.pressurePa).thrustN*control.throttle:0;
      const inertial=ecefToTemeApprox(y.p,y.v,at);
      const totalMassKg=massNow();
      // Proper acceleration = magnitude of specific non-gravitational force;
      // thrust and drag are vector forces and can oppose each other.
      const dragAcceleration=aero.airspeedMps>1e-12
        ?times(aero.airRelative,
            -aero.qPa*vehicle.dragCoefficient*vehicle.referenceAreaM2/
            (aero.airspeedMps*totalMassKg))
        :[0,0,0] as V3;
      const thrustAcceleration=flight.current==="powered"
        ?times(thrustUnitEcef(y.p,control),thrust/totalMassKg)
        :[0,0,0] as V3;
      const proper=magnitude(plus(thrustAcceleration,dragAcceleration));
      return {
        time:at,tSeconds:t,stageIndex,flightMode:flight.current,
        massKg:totalMassKg,propellantRemainingKg:Math.max(0,y.propKg),
        positionEcefM:{x:y.p[0],y:y.p[1],z:y.p[2]},
        velocityEcefMps:{x:y.v[0],y:y.v[1],z:y.v[2]},
        ...inertial,
        latitudeDeg:location.latitudeDeg,longitudeDeg:location.longitudeDeg,
        altitudeM:location.altitudeM,
        speedInertialMps:magnitude(toVector(inertial.velocityTemeKmS))*1000,
        speedAirRelativeMps:aero.airspeedMps,
        dynamicPressurePa:aero.qPa,
        mach:aero.airspeedMps/aero.speedOfSoundMps,
        thrustN:thrust,accelerationProperMps2:proper,
      };
    };

    const makeDerivative=(state:IntegrationState,atSeconds:number,ctx:StageContext):Derivative=>{
      const atmo=aerodynamics(state,environment);
      const mass=totalMass(vehicle,ctx.stageIndex,state.propKg,ctx.fairingAttached);
      const grav=gravityEcefMps2(state.p,environment.useJ2??false);
      // Rotating ECEF equations: dv/dt = F/m + g - 2ω×v - ω×(ω×r).
      const coriolis:V3=[
        2*EARTH_OMEGA_RAD_S*state.v[1],
        -2*EARTH_OMEGA_RAD_S*state.v[0],
        0,
      ];
      const centrifugal:V3=[
        EARTH_OMEGA_RAD_S**2*state.p[0],
        EARTH_OMEGA_RAD_S**2*state.p[1],
        0,
      ];
      const CdA=vehicle.dragCoefficient*vehicle.referenceAreaM2;
      const drag=magnitude(atmo.airRelative)>1e-12
        ?times(atmo.airRelative,-0.5*atmo.densityKgM3*CdA*atmo.airspeedMps/mass)
        :[0,0,0] as V3;
      let thrustAcc:V3=[0,0,0];
      let mdot=0;
      if(ctx.powered){
        const engine=engineAt(vehicle.stages[ctx.stageIndex]!,atmo.pressurePa);
        const control=guidanceAt(guidance,atSeconds);
        const thrustN=engine.thrustN*control.throttle;
        mdot=engine.massFlowKgS*control.throttle;
        thrustAcc=times(thrustUnitEcef(state.p,control),thrustN/mass);
      }
      return {
        p:state.v,
        v:plus(plus(plus(plus(grav,coriolis),centrifugal),drag),thrustAcc),
        propKg:-mdot,
      };
    };

    const addState=(state:IntegrationState,d:Derivative,h:number):IntegrationState=>({
      p:plus(state.p,times(d.p,h)),
      v:plus(state.v,times(d.v,h)),
      propKg:state.propKg+h*d.propKg,
    });

    const rk4=(state:IntegrationState,time:number,h:number,ctx:StageContext):IntegrationState=>{
      const k1=makeDerivative(state,time,ctx);
      const k2=makeDerivative(addState(state,k1,h/2),time+h/2,ctx);
      const k3=makeDerivative(addState(state,k2,h/2),time+h/2,ctx);
      const k4=makeDerivative(addState(state,k3,h),time+h,ctx);
      const weighted=(a:V3,b:V3,c:V3,d:V3):V3=>[
        (a[0]+2*b[0]+2*c[0]+d[0])/6,
        (a[1]+2*b[1]+2*c[1]+d[1])/6,
        (a[2]+2*b[2]+2*c[2]+d[2])/6,
      ];
      return {
        p:plus(state.p,times(weighted(k1.p,k2.p,k3.p,k4.p),h)),
        v:plus(state.v,times(weighted(k1.v,k2.v,k3.v,k4.v),h)),
        propKg:state.propKg+h*(k1.propKg+2*k2.propKg+2*k3.propKg+k4.propKg)/6,
      };
    };

    const burnout=()=>{
      const stage=vehicle.stages[stageIndex]!;
      y={...y,propKg:0};
      recordEvent("stage-burnout",undefined,stage.name);
      flight.current=stageIndex+1<vehicle.stages.length?"coast":"complete";
      if(flight.current==="coast")nextIgnitionTime=t+(stage.coastAfterBurnSeconds??0);
    };
    const igniteNextStage=()=>{
      const previous=vehicle.stages[stageIndex]!;
      recordEvent("stage-separation",undefined,previous.name);
      stageIndex++;
      y={...y,propKg:vehicle.stages[stageIndex]!.propellantMassKg};
      flight.current="powered";
      recordEvent("stage-ignition",undefined,vehicle.stages[stageIndex]!.name);
      nextIgnitionTime=Number.POSITIVE_INFINITY;
    };

    const first=vehicle.stages[0]!;
    const seaAtStart=engineAt(first,101325);
    const initialControl=guidanceAt(guidance,0);
    if(!(seaAtStart.thrustN*initialControl.throttle>originalMassKg*STANDARD_G0))
      throw new RangeError("Insufficient initial thrust for this ascent scenario (relative to nominal g0)");
    recordEvent("liftoff","Illustrative/user-specified vehicle model; not a published flight path");
    recordEvent("stage-ignition",undefined,first.name);
    samples.push(sample());

    while(t<finalT-1e-10){
      if(samples.length>=maxSamples)throw new RangeError("Exceeded maxSamples; increase stepSeconds or maxSamples");
      if(flight.current==="coast" && nextIgnitionTime<=t+1e-8){
        igniteNextStage();
        continue;
      }
      const stage=vehicle.stages[stageIndex]!;
      if(flight.current==="powered" && y.propKg<=EPS){
        burnout();
        continue;
      }

      let h=Math.min(dtMax,finalT-t);
      if(flight.current==="coast")h=Math.min(h,Math.max(0,nextIgnitionTime-t));
      if(fairingAttached && vehicle.fairingJettisonAtSeconds!==undefined && t<vehicle.fairingJettisonAtSeconds-1e-9)
        h=Math.min(h,vehicle.fairingJettisonAtSeconds-t);
      for(const knot of guidance.program){
        if(knot.tSeconds>t+1e-9){h=Math.min(h,knot.tSeconds-t);break;}
      }
      if(!(h>1e-9)){
        if(flight.current==="coast" && nextIgnitionTime<=t+1e-8){igniteNextStage();continue;}
        throw new Error("Simulation step underflow");
      }

      const ctx:StageContext={stageIndex,powered:flight.current==="powered",fairingAttached};
      let candidate=rk4(y,t,h,ctx);
      let exhausted=false;
      if(flight.current==="powered" && candidate.propKg<=0){
        // Solve exact depletion boundary to submillisecond resolution.
        let lo=0,hi=h;
        for(let i=0;i<38 && hi-lo>1e-7;i++){
          const mid=(lo+hi)/2;
          if(rk4(y,t,mid,ctx).propKg>0)lo=mid;
          else hi=mid;
        }
        h=hi;
        candidate=rk4(y,t,h,ctx);
        exhausted=true;
      }
      y={...candidate,propKg:Math.max(0,candidate.propKg)};
      t=Math.min(finalT,t+h);

      if(fairingAttached && vehicle.fairingJettisonAtSeconds!==undefined &&
          t>=vehicle.fairingJettisonAtSeconds-1e-8){
        fairingAttached=false;
        recordEvent("fairing-jettison");
      }
      if(exhausted)burnout();
      if(flight.current==="coast" && nextIgnitionTime<=t+1e-8)igniteNextStage();

      const location=ecefToGeodetic(y.p);
      if((options.stopAtImpact??true) && t>1 && location.altitudeM<site.altitudeM-1){
        termination="impact";
        recordEvent("impact");
      }
      samples.push(sample());
      if(termination==="impact")break;
    }

    recordEvent("simulation-end",termination);
    const peakQ=samples.reduce((a,b)=>b.dynamicPressurePa>a.dynamicPressurePa?b:a,samples[0]!);
    events.push({
      kind:"max-q",time:peakQ.time,tSeconds:peakQ.tSeconds,
      massKg:peakQ.massKg,altitudeM:peakQ.altitudeM,
      details:`peak dynamic pressure ${peakQ.dynamicPressurePa.toFixed(1)} Pa (sampled)`,
    });
    events.sort((a,b)=>a.tSeconds-b.tSeconds);
    const final=samples[samples.length-1]!;
    const estimate=twoBodyOrbitEstimate(
      times(toVector(final.positionTemeKm),1000),
      times(toVector(final.velocityTemeKmS),1000),
    );
    // Aggregate in a single pass: spreading up to 100,000 array elements into
    // Math.max() can overflow the JS argument count limit.
    let maxProperAccelerationMps2=0;
    let maxAltitudeM=-Infinity;
    let maxInertialSpeedMps=0;
    for(const s of samples){
      maxProperAccelerationMps2=Math.max(maxProperAccelerationMps2,s.accelerationProperMps2);
      maxAltitudeM=Math.max(maxAltitudeM,s.altitudeM);
      maxInertialSpeedMps=Math.max(maxInertialSpeedMps,s.speedInertialMps);
    }
    const summary:AscentSummary={
      initialMassKg:originalMassKg,finalMassKg:final.massKg,
      elapsedSeconds:t,maxDynamicPressurePa:peakQ.dynamicPressurePa,
      maxProperAccelerationMps2,maxAltitudeM,maxInertialSpeedMps,
      finalOrbit:estimate,terminatedBy:termination,
    };
    return {
      vehicleName:vehicle.name,start:new Date(liftoff),samples,events,summary,
      model:"rotating-ecef-3dof-rk4",
      frameAccuracy:"approximate-TEME-via-GMST",
      limitations:[
        "Point-mass 3DOF model; no 6DOF attitude/aerodynamic stability or verified flight software.",
        "Pitch/azimuth/throttle schedule and stage parameters must be supplied; LL2 does not provide a trajectory.",
        "Standard atmosphere with optional uniform wind and exponential upper-atmosphere tail; no measured weather/winds.",
        "Central or optional J2 gravity; no third-body forces, thrust-vector transients, detailed staging or adaptive error estimator.",
        "Earth-fixed to TEME-like conversion uses GMST approximation without EOP/polar motion; encounter screening is exploratory.",
        "No verified vehicle profiles, uncertainty corridor, tasking, collision probability or flight qualification.",
      ],
      // Date has millisecond precision: collapse any sub-ms RK4 event samples
      // onto the last state at that instant before cubic-Hermite interpolation.
      toTrajectory:()=>{
        const points:Array<{time:Date;positionTemeKm:AscentSample["positionTemeKm"];velocityTemeKmS:AscentSample["velocityTemeKmS"]}>=[];
        for(const s of samples){
          const p={time:s.time,positionTemeKm:s.positionTemeKm,velocityTemeKmS:s.velocityTemeKmS};
          if(points.length && points[points.length-1]!.time.getTime()===s.time.getTime()){
            points[points.length-1]=p;
          }else points.push(p);
        }
        return new SampledTemeTrajectory(points);
      },
    };
  }

  fromLaunch(input:LaunchScenarioInput):AscentSimulationResult {
    const {launch,...rest}=input;
    if(!(launch.net instanceof Date) || Number.isNaN(launch.net.getTime()))
      throw new TypeError("Launch has no valid NET");
    if(!launch.pad || !Number.isFinite(launch.pad.latitude) || !Number.isFinite(launch.pad.longitude))
      throw new RangeError("Launch has no verified numeric pad coordinates; supply an explicit launch site instead");
    return this.simulate({
      ...rest,liftoff:launch.net,
      site:{latitudeDeg:launch.pad.latitude!,longitudeDeg:launch.pad.longitude!,altitudeM:0},
    });
  }
}

export function totalMass(vehicle:LaunchVehicle,currentStageIndex:number,propellantRemainingKg:number,fairingAttached:boolean):number {
  let mass=vehicle.payloadMassKg+(fairingAttached?(vehicle.fairingMassKg??0):0);
  for(let i=currentStageIndex;i<vehicle.stages.length;i++){
    const stage=vehicle.stages[i]!;
    mass+=stage.dryMassKg+(i===currentStageIndex?Math.max(0,propellantRemainingKg):stage.propellantMassKg);
  }
  return mass;
}

function aerodynamics(state:IntegrationState,environment:LaunchSimulationOptions["environment"]) {
  const env=environment??{};
  const location=ecefToGeodetic(state.p);
  const atmo=airAtAltitude(location.altitudeM,env.upperAtmosphereScaleHeightM??7000);
  const airRelative=minus(state.v,windEcefMps(state.p,env));
  const airspeedMps=magnitude(airRelative);
  return {
    pressurePa:atmo.pressurePa,densityKgM3:atmo.densityKgM3,
    speedOfSoundMps:atmo.speedOfSoundMps,
    airRelative,airspeedMps,
    qPa:0.5*atmo.densityKgM3*airspeedMps**2,
    altitudeM:location.altitudeM,
  };
}

function validate(o:LaunchSimulationOptions):void {
  if(!(o.liftoff instanceof Date)||!Number.isFinite(o.liftoff.getTime()))throw new TypeError("liftoff must be a valid Date");
  if(!Number.isFinite(o.durationSeconds)||o.durationSeconds<=0||o.durationSeconds>86_400)
    throw new RangeError("durationSeconds must be in (0, 86400]");
  if(!Number.isFinite(o.stepSeconds??1)||(o.stepSeconds??1)<=0||(o.stepSeconds??1)>20)
    throw new RangeError("stepSeconds must be in (0, 20]");
  if(!Number.isInteger(o.maxSamples??100_000)||(o.maxSamples??100_000)<2)
    throw new RangeError("maxSamples must be >= 2");
  if(!Number.isFinite(o.site.latitudeDeg)||Math.abs(o.site.latitudeDeg)>90 ||
      !Number.isFinite(o.site.longitudeDeg)||Math.abs(o.site.longitudeDeg)>180 ||
      !Number.isFinite(o.site.altitudeM)||o.site.altitudeM< -500||o.site.altitudeM>9000)
    throw new RangeError("Invalid launch site WGS84 latitude/longitude/altitude");
  const v=o.vehicle;
  if(!v.name||!v.stages.length||v.stages.length>12||!(v.payloadMassKg>=0)||
      !(v.referenceAreaM2>0)||!(v.dragCoefficient>=0)||
      ![v.payloadMassKg,v.referenceAreaM2,v.dragCoefficient].every(Number.isFinite))
    throw new RangeError("Invalid vehicle or payload/area/drag properties");
  if(v.fairingMassKg!==undefined && (!Number.isFinite(v.fairingMassKg)||v.fairingMassKg<0))
    throw new RangeError("Invalid fairingMassKg");
  if(v.fairingJettisonAtSeconds!==undefined && (!(v.fairingJettisonAtSeconds>0)||
      !(v.fairingJettisonAtSeconds<o.durationSeconds)))throw new RangeError("Invalid fairing jettison time");
  for(const s of v.stages){
    if(!s.name||![s.dryMassKg,s.propellantMassKg,s.thrustSeaLevelN,s.thrustVacuumN,
      s.ispSeaLevelS,s.ispVacuumS].every(Number.isFinite)||
      !(s.dryMassKg>0&&s.propellantMassKg>0&&s.thrustSeaLevelN>0&&s.thrustVacuumN>0&&
        s.ispSeaLevelS>0&&s.ispVacuumS>0)||!(s.coastAfterBurnSeconds===undefined||
          (Number.isFinite(s.coastAfterBurnSeconds)&&s.coastAfterBurnSeconds>=0)))
      throw new RangeError(`Invalid stage ${s.name} masses, thrust, Isp or coast`);
  }
  if(!o.guidance.program.length || o.guidance.program[0]!.tSeconds!==0)
    throw new RangeError("Guidance program must start at T+0");
  for(let i=0;i<o.guidance.program.length;i++){
    const p=o.guidance.program[i]!;
    if(!Number.isFinite(p.tSeconds)||!Number.isFinite(p.elevationDeg)||
      !Number.isFinite(p.azimuthDeg)||p.elevationDeg< -90||p.elevationDeg>90||
      p.azimuthDeg<0||p.azimuthDeg>=360||
      !(p.throttle===undefined||(Number.isFinite(p.throttle)&&p.throttle>=0&&p.throttle<=1))||
      (i>0&&p.tSeconds<=o.guidance.program[i-1]!.tSeconds))
      throw new RangeError("Guidance program times, azimuth/elevation or throttle invalid");
  }
  const env=o.environment??{};
  if(!(env.upperAtmosphereScaleHeightM===undefined ||
    (Number.isFinite(env.upperAtmosphereScaleHeightM)&&env.upperAtmosphereScaleHeightM>0)))
    throw new RangeError("upperAtmosphereScaleHeightM must be > 0");
  for(const wind of [env.windEastMps,env.windNorthMps,env.windUpMps])
    if(wind!==undefined&&!Number.isFinite(wind))throw new RangeError("Invalid wind component");
}
