export interface RuntimeConfig { host:string; port:number; configDir:string; noOpen:boolean; workspace?:string; demo:boolean }
export interface DoctorReport { node:{version:string;available:boolean}; libreOffice:{available:boolean;path?:string;version?:string;errorCode?:string};speech:{runtimeAvailable:boolean;runtimeVersion:string;modelReady:boolean;cacheDirectory:string;errorCode?:string} }
