import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {MySequence} from './sequence';
// For Login Start
import {AuthenticationComponent} from '@loopback/authentication';
import {
  SECURITY_SCHEME_SPEC,
  UserServiceBindings,
  JWTAuthenticationComponent,
  AdminJWTAuthenticationComponent
} from './services/auth-jwt'
import {MemDataSource} from './datasources';
// For Login End
import {RegexpService} from './tools/regexp/regexp';
import {MarsApiPathService} from './services/mars-API/mars-api-paths';
import {MarsConnectorService} from './services/mars-connector/mars-connector';

export {ApplicationConfig};

export class MarsmiddleApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);
 
    //  Set up DB
    var fs = require('fs');
    const path = './database/memoryDB.json'
    try {
      if (fs.existsSync(path)) {
        //file exists
        console.log('Database Exists.');
      } else {
        //file doesn't exist
        const initDbContent = {
          "ids": {
            "User": 2,
            "UserCredentials": 2
          },
          "models": {
            "User": {
              "admin": "{\"id\":\"admin\",\"username\":\"admin\",\"role\":\"administrator\",\"tokens\":[\"defaultBlank\"]}"
            },
            "UserCredentials": {
              "37e78818-1562-4b44-90c5-f3c6c1db98dd": "{\"id\":\"37e78818-1562-4b44-90c5-f3c6c1db98dd\",\"password\":\"$2a$10$Tk50yE46D/IkqXL8/CCs2OIfGjz7SMCGuQmjzKEOuBm04fZpusb9.\",\"userId\":\"admin\"}"
            }
          } 
        };
        fs.writeFile(path, JSON.stringify(initDbContent), function (err: any) {
          if (err) throw err;
          console.log('Database Initialized.');
        });
      }
    } catch(err) {
      console.error(err)
    }

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    // this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    // Mount authentication system
    this.component(AuthenticationComponent);
    // Mount jwt component
    this.component(JWTAuthenticationComponent);
    // Mount admin-jwt component
    this.component(AdminJWTAuthenticationComponent);
    // Bind datasource
    this.dataSource(MemDataSource, UserServiceBindings.DATASOURCE_NAME);

    // Bind regexp
    this.bind('regexpService').toClass(RegexpService);

    // Bind MARS API path service
    this.bind('marsApiPathService').toClass(MarsApiPathService);
    // Bind MARS connector service
    this.bind('marsConnectorService').toClass(MarsConnectorService);
  }
}
