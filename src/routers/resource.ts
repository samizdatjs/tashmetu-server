import {Collection, Database, Logger, QueryOptions} from '@ziqquratu/ziqquratu';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as SocketIO from 'socket.io';
import {serializeError} from 'serialize-error';
import {get, post, put, del} from '../decorators';
import {router, ControllerFactory} from '../controller';

export interface ResourceConfig {
  collection: string;

  readOnly?: boolean;
}

export class Resource {
  public constructor(
    protected collection: Collection,
    protected logger: Logger,
    protected readOnly = false
  ) {}

  public onConnection(socket: SocketIO.Socket) {
    const logger = this.logger.inScope('socket');

    this.collection.on('document-upserted', doc => {
      socket.emit('document-upserted', doc, this.collection.name);
      logger.info(`'${socket.nsp.name}' emitted 'document-upserted' for id '${doc._id}'`);
    });
    this.collection.on('document-removed', doc => {
      socket.emit('document-removed', doc, this.collection.name);
      logger.info(`'${socket.nsp.name}' emitted 'document-removed' for id '${doc._id}'`);
    });
    this.collection.on('document-error', err => {
      socket.emit('document-error', err, this.collection.name);
      logger.info(`'${socket.nsp.name}' emitted 'document-error' with message '${err.message}'`);
    });
  }

  public toString(): string {
    const access = this.readOnly ? 'read only' : 'read/write';
    return `resource using collection '${this.collection.name}' (${access})`;
  }

  @get('/')
  public async getAll(req: express.Request, res: express.Response) {
    return this.formResponse(res, 200, false, async () => {
      const selector = this.parseJson(req.query.selector);
      const options: QueryOptions = this.parseJson(req.query.options);
      const count = await this.collection.find(selector).count(false);

      res.setHeader('X-total-count', count.toString());

      return this.collection.find(selector, options).toArray();
    });
  }

  @get('/:id')
  public async getOne(req: express.Request, res: express.Response) {
    return this.formResponse(res, 200, false, async () => {
      const doc = await this.collection.findOne({_id: req.params.id});
      if (!doc) {
        res.statusCode = 404;
        res.send(null);
      }
      return doc;
    });
  }

  @post('/', bodyParser.json())
  public async postOne(req: express.Request, res: express.Response) {
    return this.formResponse(res, 201, true, async () => {
      return this.collection.insertOne(req.body);
    });
  }

  @put('/:id', bodyParser.json())
  public async putOne(req: express.Request, res: express.Response) {
    return this.formResponse(res, 200, true, async () => {
      return this.collection.replaceOne({_id: req.params.id}, req.body);
    });
  }

  @del('/:id', bodyParser.json())
  public async deleteOne(req: express.Request, res: express.Response) {
    return this.formResponse(res, 200, true, async () => {
      const doc = await this.collection.deleteOne({_id: req.params.id});
      if (!doc) {
        res.statusCode = 204;
        res.send(null);
      }
      return doc;
    });
  }

  private async formResponse(
    res: express.Response, statusCode: number, write: boolean, fn: () => Promise<any>
  ) {
    res.setHeader('Content-Type', 'application/json');

    if (this.readOnly && write) {
      res.statusCode = 403;
      return serializeError(new Error('Resource is read only'));
    }
    try {
      res.statusCode = statusCode;
      return await fn();
    } catch (err) {
      res.statusCode = 500;
      return serializeError(err);
    }
  }

  private parseJson(input: any): Record<string, any> {
    try {
      return JSON.parse(input);
    } catch (e) {
      return {};
    }
  }
}

export class ResourceFactory extends ControllerFactory {
  constructor(private config: ResourceConfig) {
    super('ziqquratu.Database', 'tashmetu.Logger');
  }

  public create(): Promise<any> {
    return this.resolve(async (db: Database, logger: Logger) => {
      return new Resource(
        await db.collection(this.config.collection),
        logger.inScope('Resource'),
        this.config.readOnly
      );
    });
  }
}

/**
 * Create a resource request handler.
 *
 * This function creates a router that interacts with a Ziggurat database collection.
 */
export const resource = (config: ResourceConfig) => router(new ResourceFactory(config));
