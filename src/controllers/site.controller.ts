import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  put,
  del,
  requestBody,
  response,
} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Site, Controller} from '../models';
import {SiteRepository} from '../repositories';
import {RegexpService} from '../tools/regexp/regexp';
import {CustomHttpError} from '../tools/customError/customHttpError';
import {MarsConnectorService} from '../services/mars-connector/mars-connector';

export function getSiteModelResSchemaRef() {
  let schemaRef = getModelSchemaRef(Site, {
                                            includeRelations: true,
                                            exclude: ['siteId']
                                          }
                                    );
  const excludeControllerProperties: (keyof Controller)[] = [
    'siteName', 'controllerId', 'loginPassword', 'errorLog'
  ];
  excludeControllerProperties.forEach((key) => {
    if (schemaRef.definitions.ControllerExcluding_siteId_WithRelations.properties){
      delete schemaRef.definitions.ControllerExcluding_siteId_WithRelations.properties[key];
    }
  })
  return schemaRef;
}

export function getErrorLogOfControllersOfAllSitesModelResSchemaRef() {
  let schemaRef = getModelSchemaRef(Site, {
                                            includeRelations: true,
                                            exclude: ['siteId', 'siteDescription']
                                          }
                                    );
  const excludeControllerProperties: (keyof Controller)[] = [
    'siteName', 'controllerId', 'description', 'loginPassword', 'loginStatus', 'cpuIdle', 'ramUsage', 'deviceCounts', 'availableDeviceCounts'
  ];
  excludeControllerProperties.forEach((key) => {
    if (schemaRef.definitions['ControllerExcluding_siteId-siteDescription_WithRelations'].properties){
      delete schemaRef.definitions['ControllerExcluding_siteId-siteDescription_WithRelations'].properties[key];
    }
  })
  return schemaRef;
}

export class SitesController {
  constructor(
    @repository(SiteRepository)
    public siteRepository : SiteRepository,
    @inject('marsConnectorService')
    private marsConnectorService: MarsConnectorService,
    @inject('regexpService')
    private regexpService: RegexpService
  ) {}

  async getSiteId(siteName: string): Promise<string> {
    let siteId: string = '';
    const filter: Filter<Site> = {
      "where": {"siteName": siteName}
    }
    await this.siteRepository.findOne(filter)
    .then( (res) => {
      if (res) {
        siteId = res.siteId;
      } else {
        throw new CustomHttpError(404, 'SITE_NOT_FOUND');
      }
    })
    return siteId;
  }

  @authenticate('admin-jwt')
  @post('/sites')
  @response(200, {
    description: 'Site model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Site, {
          exclude: ['siteId']
        })
      }
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Site, {
            title: 'NewSite',
            exclude: ['siteId'],
            optional: ['siteDescription']
          }),
        },
      },
    })
    site: Site,
  ): Promise<Site> {
    // Exception: Site name format
    const siteNameValidationPattern = this.regexpService.get('name_en_15');
    if (!siteNameValidationPattern.test(site.siteName)) {
      throw new CustomHttpError(422, 'SITENAME_RESTRICTIONS');
    }
    // Check if site name has been used before, it should be unique
    const filter: Filter<Site> = {
      "where": {"siteName":site.siteName}
    }
    await this.siteRepository.find(filter)
    .then( (res) => {
      if (res.length > 0) {
        throw new CustomHttpError(409, 'SITENAME_ALREADY_EXISTS');
      }
    })
    return this.siteRepository.create(site);
  }

  @authenticate('jwt')
  @get('/sites')
  @response(200, {
    description: 'Array of Site model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getSiteModelResSchemaRef(),
        },
      },
    },
  })
  async find(
    // @param.filter(Site) filter?: Filter<Site>,
  ): Promise<Site[]> {
    const filter = {
      "include": ['controllers']
    };
    // Update Controller Cluster Nodes
    const beforeUpdatedSitesArray = await this.siteRepository.find(filter);
    beforeUpdatedSitesArray.forEach( (site) => {
      if (!site.controllers) { site['controllers'] = []; }
    })
    let siteLevelPromiseArr = [];
    for (let siteIndex = 0; siteIndex < beforeUpdatedSitesArray.length; siteIndex++) {
      let  crtlLevelPromiseArr = [];
      for (let ctrlIndex = 0; ctrlIndex < beforeUpdatedSitesArray[siteIndex].controllers.length; ctrlIndex++) {
        crtlLevelPromiseArr.push(
          this.marsConnectorService.updateControllerClusterNodes(beforeUpdatedSitesArray[siteIndex].controllers[ctrlIndex])
        );
      }
      let ctrlPromiseAll = Promise.all(crtlLevelPromiseArr);
      siteLevelPromiseArr.push(ctrlPromiseAll);
    }
    await Promise.all(siteLevelPromiseArr);

    // Get Sites Data
    const sites = this.siteRepository.find(filter)
                      .then(async (siteArr) => {
                              siteArr.forEach( (site) => {
                                if (!site.controllers) { site['controllers'] = []; }
                              })
                              let siteLevelPromiseArr = [];
                              for (let siteIndex = 0; siteIndex < siteArr.length; siteIndex++) {
                                // set value of loginStatus, cpuIdle, ramUsage, deviceCounts, availableDeviceCounts for each controllers of sites
                                let  crtlLevelPromiseArr = [];
                                for (let ctrlIndex = 0; ctrlIndex < siteArr[siteIndex].controllers.length; ctrlIndex++) {
                                  crtlLevelPromiseArr.push(
                                    this.marsConnectorService.getCpuRamDevicesData(siteArr[siteIndex].controllers[ctrlIndex])
                                  );
                                }
                                let ctrlPromiseAll = Promise.all(crtlLevelPromiseArr).then((ctrlResArr) => {
                                  for (let i = 0; i < siteArr[siteIndex].controllers.length; i++) {
                                    siteArr[siteIndex].controllers[i] = ctrlResArr[i];
                                  }
                                })
                                siteLevelPromiseArr.push(ctrlPromiseAll);
                              }
                              await Promise.all(siteLevelPromiseArr)
                              return siteArr;
                      })
    return sites;
  }

  @authenticate('jwt')
  @get('/sites/{siteName}')
  @response(200, {
    description: 'Site model instance',
    content: {
      'application/json': {
        schema: getSiteModelResSchemaRef(),
      },
    },
  })
  async findById(
    @param.path.string('siteName') siteName: string,
    // @param.filter(Site, {exclude: 'where'}) filter?: FilterExcludingWhere<Site>
  ): Promise<Site> {
    // Get ID of selected site
    const siteId = await this.getSiteId(siteName);
    const filter = {
      "include": ['controllers']
    };
    // Update Controller Cluster Nodes
    const beforeUpdatedSite = await this.siteRepository.findById(siteId, filter);
    if (!beforeUpdatedSite.controllers) { beforeUpdatedSite['controllers'] = []; }
    let promiseArr = [];
    for (let i = 0; i < beforeUpdatedSite.controllers.length; i++) {
      promiseArr.push(this.marsConnectorService.updateControllerClusterNodes(beforeUpdatedSite.controllers[i]));
    }
    await Promise.all(promiseArr);
    
    // Get Site Data
    const response = this.siteRepository.findById(siteId, filter)
                      .then(async (res) => {
                        if (!res.controllers) { res['controllers'] = []; }
                        // set value of loginStatus, cpuIdle, ramUsage, deviceCounts, availableDeviceCounts
                        let  promiseArr = [];
                        for (let i = 0; i < res.controllers.length; i++) {
                          promiseArr.push(this.marsConnectorService.getCpuRamDevicesData(res.controllers[i]));
                        }
                        await Promise.all(promiseArr).then((resArr) => {
                          for (let i = 0; i < res.controllers.length; i++) {
                            res.controllers[i] = resArr[i];
                          }
                        })
                        return res;
                      })
    return response;
  }

  @authenticate('admin-jwt')
  @put('/sites/{siteName}', {
    responses: {
      '204': { description: 'Site PUT success' }
    },
  })
  async updateById(
    @param.path.string('siteName') siteName: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Site, {
            partial: true,
            exclude: ["siteId"]
          }),
        },
      },
    })
    site: Site,
  ): Promise<void> {
    // Exception: Site name format
    const siteNameValidationPattern = this.regexpService.get('name_en_15');
    if (!siteNameValidationPattern.test(site.siteName)) {
      throw new CustomHttpError(422, 'SITENAME_RESTRICTIONS');
    }

    // Get ID of selected site
    const siteId = await this.getSiteId(siteName);
    // Check if site name has been used before, it should be unique
    if (site.siteName) {
      const _filter: Filter<Site> = {
        "where": {"siteName":site.siteName}
      }
      await this.siteRepository.find(_filter)
      .then( (res) => {
        if (res.length > 0) {
          throw new CustomHttpError(409, 'SITENAME_ALREADY_EXISTS');
        }
      })
    }
    // In loopback4, Update: apply to partial fields(PATCH), Replace: apply to all fields(PUT)
    await this.siteRepository.updateById(siteId, site);
  }

  @authenticate('admin-jwt')
  @del('/sites/{siteName}', {
    responses: {
      '204': { description: 'Site DELETE success' }
    },
  })
  async deleteById(@param.path.string('siteName') siteName: string): Promise<void> {
    // Get ID of selected site
    const siteId = await this.getSiteId(siteName);
    // Delete all controllers of the Site
    const _filter: Filter<Controller> = {
      "where": {"siteId": siteId}
    }
    await this.siteRepository.controllers(siteId).delete(_filter.where);
    // Delete the Site
    await this.siteRepository.deleteById(siteId);
  }

  // @authenticate('jwt')
  // @get('/sites/count')
  // @response(200, {
  //   description: 'Site model count',
  //   content: {'application/json': {schema: CountSchema}},
  // })
  // async count(
  //   // @param.where(Site) where?: Where<Site>,
  // ): Promise<Count> {
  //   // return this.siteRepository.count(where);
  //   return this.siteRepository.count();
  // }

  @authenticate('jwt')
  @get('/sites/errorLog')
  @response(200, {
    description: 'Array of Site model with error log instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getErrorLogOfControllersOfAllSitesModelResSchemaRef(),
        },
      },
    },
  })
  async getErrorLogOfControllersOfAllSites(
    @param.query.number('hour', {required: true, description: 'Get log from the last hours'}) lastHours: number,
    @param.query.number('count', {required: true, description: 'History entry count of log'}) logCount: number
  ): Promise<Site[]> {
    const filter = {
      "include": ['controllers']
    };
    // Get Log of Controllers of all Sites Data
    const sites = this.siteRepository.find(filter)
                      .then(async (siteArr) => {
                              siteArr.forEach( (site) => {
                                if (!site.controllers) { site['controllers'] = []; }
                              })
                              let siteLevelPromiseArr = [];
                              for (let siteIndex = 0; siteIndex < siteArr.length; siteIndex++) {
                                // set error log for each controllers of sites
                                let  crtlLevelPromiseArr = [];
                                for (let ctrlIndex = 0; ctrlIndex < siteArr[siteIndex].controllers.length; ctrlIndex++) {
                                  crtlLevelPromiseArr.push(
                                    this.marsConnectorService.getControllerLog(siteArr[siteIndex].controllers[ctrlIndex], lastHours, logCount)
                                  );
                                }
                                let ctrlPromiseAll = Promise.all(crtlLevelPromiseArr).then((ctrlResArr) => {
                                  for (let i = 0; i < siteArr[siteIndex].controllers.length; i++) {
                                    siteArr[siteIndex].controllers[i] = ctrlResArr[i];
                                    delete siteArr[siteIndex].siteDescription;
                                  }
                                })
                                siteLevelPromiseArr.push(ctrlPromiseAll);
                              }
                              await Promise.all(siteLevelPromiseArr)
                              return siteArr;
                      })
    return sites;
  }

  @authenticate('jwt')
  @get('/sites/{siteName}/errorLog')
  @response(200, {
    description: 'Site model with error log instances',
    content: {
      'application/json': {
        schema: getErrorLogOfControllersOfAllSitesModelResSchemaRef(),
      },
    },
  })
  async getErrorLogOfControllersOfSpecifiedSite(
    @param.path.string('siteName') siteName: string,
    @param.query.number('hour', {required: true, description: 'Get log from the last hours'}) lastHours: number,
    @param.query.number('count', {required: true, description: 'History entry count of log'}) logCount: number,
  ): Promise<Site> {
    // Get ID of selected site
    const siteId = await this.getSiteId(siteName);
    const filter = {
      "include": ['controllers']
    };
    // Get Log of Controllers of Site Data
    const response = this.siteRepository.findById(siteId, filter)
                      .then(async (res) => {
                        if (!res.controllers) { res['controllers'] = []; }
                        // set error log for each controllers of sites
                        let  promiseArr = [];
                        for (let i = 0; i < res.controllers.length; i++) {
                          promiseArr.push(this.marsConnectorService.getControllerLog(res.controllers[i], lastHours, logCount));
                        }
                        await Promise.all(promiseArr).then((resArr) => {
                          for (let i = 0; i < res.controllers.length; i++) {
                            res.controllers[i] = resArr[i];
                            delete res.siteDescription;
                          }
                        })
                        return res;
                      })
    return response;
  }
  
}
