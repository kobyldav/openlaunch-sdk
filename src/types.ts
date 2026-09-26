export type Id = string | number;
export type ResponseMode = "list" | "normal" | "detailed";
export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[];
export type Query = Record<string, QueryValue>;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  search?: string;
  ordering?: string;
  mode?: ResponseMode;
  filters?: Query;
}

export interface SourceRef {
  provider: "launch-library-2";
  id: Id;
  url?: string;
}

export interface ImageRef {
  url: string;
  name?: string;
  thumbnailUrl?: string;
  credit?: string;
  license?: string;
}

export interface StatusRef {
  id?: Id;
  name: string;
  abbreviation?: string;
  description?: string;
}

export interface CountryRef {
  name: string;
  code?: string;
}

export interface Agency {
  id: Id;
  name: string;
  abbreviation?: string;
  type?: string;
  country?: CountryRef;
  administrator?: string;
  foundingYear?: number;
  description?: string;
  website?: string;
  wikiUrl?: string;
  logo?: ImageRef;
  image?: ImageRef;
  source: SourceRef;
}

export interface Rocket {
  id: Id;
  name: string;
  fullName?: string;
  manufacturer?: Agency;
  active?: boolean;
  reusable?: boolean;
  maidenFlight?: Date;
  lengthMeters?: number;
  diameterMeters?: number;
  launchMassKg?: number;
  leoCapacityKg?: number;
  gtoCapacityKg?: number;
  successfulLaunches?: number;
  failedLaunches?: number;
  totalLaunches?: number;
  description?: string;
  wikiUrl?: string;
  infoUrl?: string;
  image?: ImageRef;
  source: SourceRef;
}

export interface LaunchPad {
  id: Id;
  name: string;
  location?: string;
  country?: CountryRef;
  latitude?: number;
  longitude?: number;
  active?: boolean;
  description?: string;
  mapUrl?: string;
  wikiUrl?: string;
  image?: ImageRef;
  source: SourceRef;
}

export interface OrbitRef {
  name: string;
  abbreviation?: string;
}

export interface Mission {
  id?: Id;
  name?: string;
  description?: string;
  type?: string;
  orbit?: OrbitRef;
}

export interface VideoRef {
  url: string;
  title?: string;
  publisher?: string;
  featured?: boolean;
}

export interface Launch {
  id: Id;
  name: string;
  slug?: string;
  designator?: string;
  status: StatusRef;
  net: Date;
  windowStart?: Date;
  windowEnd?: Date;
  lastUpdated?: Date;
  probability?: number;
  holdReason?: string;
  failReason?: string;
  hashtag?: string;
  rocket?: Rocket;
  provider?: Agency;
  pad?: LaunchPad;
  mission?: Mission;
  webcast?: VideoRef;
  videos: VideoRef[];
  image?: ImageRef;
  source: SourceRef;
}

export interface Astronaut {
  id: Id;
  name: string;
  status?: string;
  type?: string;
  agency?: Agency;
  nationality?: string;
  bio?: string;
  dateOfBirth?: Date;
  dateOfDeath?: Date;
  firstFlight?: Date;
  lastFlight?: Date;
  flightsCount?: number;
  landingsCount?: number;
  spacewalksCount?: number;
  timeInSpace?: string;
  evaTime?: string;
  inSpace?: boolean;
  image?: ImageRef;
  source: SourceRef;
}

export interface SpaceEvent {
  id: Id;
  name: string;
  type?: string;
  description?: string;
  date: Date;
  datePrecision?: string;
  location?: string;
  duration?: string;
  webcast?: VideoRef;
  videos: VideoRef[];
  image?: ImageRef;
  source: SourceRef;
}

export interface GenericEntity {
  id: Id;
  name: string;
  description?: string;
  image?: ImageRef;
  source: SourceRef;
}

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

export interface ThrottleStatus {
  requestLimit: number;
  frequencySeconds: number;
  currentUse: number;
  nextUseSeconds: number;
  identity: string;
}
