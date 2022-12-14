import {ApplicationConfig, ExpressServer, MarsmiddleApplication} from './express-server';

export {ApplicationConfig, ExpressServer, MarsmiddleApplication};


export async function main(options: ApplicationConfig = {}) {

  const server = new ExpressServer(options);
  await server.boot();
  await server.start();

  // const app = new MarsmiddleApplication(options);
  // await app.boot();
  // await app.start();

  // const url = app.restServer.url;
  // console.log(`Server is running at ${url}`);
  // console.log(`Try ${url}/ping`);

  // return app;
}

if (require.main === module) {
  // Run the application
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST,
      // The `gracePeriodForClose` provides a graceful close for http/https
      // servers with keep-alive clients. The default value is `Infinity`
      // (don't force-close). If you want to immediately destroy all sockets
      // upon stop, set its value to `0`.
      // See https://www.npmjs.com/package/stoppable
      gracePeriodForClose: 5000, // 5 seconds
      openApiSpec: {
        // useful when used with OpenAPI-to-GraphQL to locate your application
        setServersFromRequest: true,
      },
      // Note listenOnStart is set to false to instruct the LB4 application is not listening on HTTP 
      // when it’s started as the Express server will be listening
      listenOnStart: false,
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
