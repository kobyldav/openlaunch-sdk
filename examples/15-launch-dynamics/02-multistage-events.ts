/**
 * Stage dry-mass jettison, fuel depletion, fairing and ignition timeline.
 * Network: no
 */
import { LaunchDynamicsEngine } from "../../src/index.js";

const result=new LaunchDynamicsEngine().simulate({
  site:{latitudeDeg:5.2,longitudeDeg:-52.7,altitudeM:10},
  liftoff:new Date("2026-10-12T14:00:00Z"),
  vehicle:{
    name:"Illustrative two-stage",payloadMassKg:50,
    fairingMassKg:15,fairingJettisonAtSeconds:25,
    dragCoefficient:0.35,referenceAreaM2:0.5,
    stages:[
      {name:"booster",dryMassKg:200,propellantMassKg:600,thrustSeaLevelN:40000,
        thrustVacuumN:44000,ispSeaLevelS:285,ispVacuumS:312,coastAfterBurnSeconds:3},
      {name:"upper",dryMassKg:70,propellantMassKg:300,thrustSeaLevelN:14000,
        thrustVacuumN:15500,ispSeaLevelS:308,ispVacuumS:335},
    ],
  },
  guidance:{program:[
    {tSeconds:0,elevationDeg:90,azimuthDeg:90},
    {tSeconds:60,elevationDeg:70,azimuthDeg:90},
    {tSeconds:160,elevationDeg:40,azimuthDeg:90},
  ]},
  durationSeconds:140,stepSeconds:1,
});
console.table(result.events.map(e=>({t:e.tSeconds,type:e.kind,stage:e.stageName,mass:e.massKg})));
