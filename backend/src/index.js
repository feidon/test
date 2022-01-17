// resolvers
import Query from "./resolvers/Query.js";
import Mutation from "./resolvers/Mutation.js";
import DateResolver from "./resolvers/Date.js";
import StatusResolver from "./resolvers/Status.js";
import Subscription from "./resolvers/Subscription.js";
// db
import taskModel from "./models/task.js";

import mongo from "./mongo.js";

import "dotenv-defaults/config.js";

import express from "express";
import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import fs from "fs";
import https from "https";
import http from "http";
import path from "path";
import { execute, subscribe } from "graphql";
import { SubscriptionServer } from "subscriptions-transport-ws";

import { GraphQLFileLoader } from "@graphql-tools/graphql-file-loader";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { loadSchema } from "@graphql-tools/load";
import { PubSub } from "graphql-subscriptions";

mongo.connect();

(async () => {
  const typeDefs = await loadSchema("./src/schema.graphql", {
    loaders: [new GraphQLFileLoader()],
  });

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      Query,
      Mutation,
      Subscription,
      Date: DateResolver,
      Status: StatusResolver,
    },
  });

  const app = express();
  const pubSub = new PubSub();

  const configurations = {
    production: { ssl: true, port: 4001, hostname: "35.206.192.151" },
    development: { ssl: false, port: 4001, hostname: "localhost" },
  };
  const environment = process.env.NODE_ENV || "production";
  const config = configurations[environment];
  let httpServer;
  if (config.ssl) {
    httpServer = https.createServer(
      {
        key: fs.readFileSync(`./src/ssl/${environment}/domain.key`),
        cert: fs.readFileSync(`./src/ssl/${environment}/domain.crt`),
      },

      app
    );
  } else {
    httpServer = http.createServer(app);
  }

  const subscriptionServer = SubscriptionServer.create(
    { schema, execute, subscribe },
    { server: httpServer, path: "/graphql" }
  );

  const server = new ApolloServer({
    schema,
    context: {
      taskModel,
      pubSub,
    },
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              subscriptionServer.close();
            },
          };
        },
      },
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
  });

  await server.start();

  server.applyMiddleware({ app });

  await new Promise((resolve) =>
    httpServer.listen({ port: config.port }, resolve)
  );

  console.log(
    "🚀 Server ready at",
    `http${config.ssl ? "s" : ""}://${config.hostname}:${config.port}${
      server.graphqlPath
    }`
  );

  console.log(
    "🚀 Subscription endpoint ready at",
    `ws${config.ssl ? "s" : ""}://${config.hostname}:${config.port}${
      server.graphqlPath
    }`
  );
})();
