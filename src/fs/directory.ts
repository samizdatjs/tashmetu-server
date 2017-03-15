import {Collection, Serializer} from '@samizdatjs/tashmetu';
import {FileSystem, DirectoryConfig, FSStorageAdapter} from './interfaces';
import {basename, dirname, join} from 'path';

export function directory(config: DirectoryConfig): any {
  return function (target: any) {
    Reflect.defineMetadata('tiamat:provider', {
      for: config.providerFor,
      singleton: true,
      activator: 'tashmetu.FSCollectionManager'
    }, target);
    Reflect.defineMetadata('tashmetu:directory', config, target);
  };
}

export class Directory implements FSStorageAdapter {
  public constructor(
    private collection: Collection,
    private serializer: Serializer,
    private fs: FileSystem,
    private config: DirectoryConfig
  ) {
    fs.readdir(config.path).forEach((name: string) => {
      let doc = this.loadPath(join(config.path, name));
      collection.upsert(doc);
    });
  }

  public update(path: string): void {
    this.collection.upsert(this.loadPath(path));
  }

  private loadPath(path: string): any {
    let doc: any = this.serializer.parse(this.fs.read(path));
    doc._id = basename(path).split('.')[0];
    return doc;
  }
}
