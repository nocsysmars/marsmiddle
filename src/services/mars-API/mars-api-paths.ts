export enum CMDtype {
  cpu = 'cpu',
  memory = 'memory',
  disk = 'disk'
}

export class MarsApiPathService {

	constructor() {
  }

  getCpuRamDiskStatusPath(type: CMDtype, startTime: string, endTime: string, interval: string = '30'): string {
    return `/mars/analyzer/v1/timerangebar_all/ctrl/${type}/${startTime}/${endTime}/${interval}`;
  }

  getDevicesStatusPath(): string {
    return `/mars/v1/devices`;
  }

  getControllerClusterNodes(): string {
    return `/mars/v1/cluster`;
  }

  getControllerLog(startTime: string, totalCount: number, matchString: string, fileSource: string): string {
    return `/mars/utility/logs/v1/controller?start=${startTime}&number=${totalCount}&match=${matchString}&source=${encodeURIComponent(fileSource)}`;
  }

  getControllerLogSourceFile(): string {
    return `/mars/utility/logs/v1/source_files`;
  }

}