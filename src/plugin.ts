import { promisify } from 'util';
import { loadSync } from 'protobufjs';
import { optionsFromParameter, readToBuffer } from './utils';
import { google } from '../build/pbjs';
import { generateFile } from './main';
import { createTypeMap } from './types';
import CodeGeneratorRequest = google.protobuf.compiler.CodeGeneratorRequest;
import CodeGeneratorResponse = google.protobuf.compiler.CodeGeneratorResponse;
import Feature = google.protobuf.compiler.CodeGeneratorResponse.Feature;

const getProtoPath = (relativePath = '.', name: string) => (process.cwd() + '/' + relativePath + '/' + name);
const getParamsFromString = (params: string): Record<string, string> => params.split(',').reduce((acc, param) => {
  const [key, value] = param.split('=');
  acc[key] = value;

  return acc;
}, {}) 

// this would be the plugin called by the protoc compiler
async function main() {
  const stdin = await readToBuffer(process.stdin);
  // const json = JSON.parse(stdin.toString());
  // const request = CodeGeneratorRequest.fromObject(json);
  const request = CodeGeneratorRequest.decode(stdin);
  const typeMap = createTypeMap(request, optionsFromParameter(request.parameter));
  const { protoPath } = getParamsFromString(request.parameter);
  const files = request.protoFile.map((file) => {
    let parsed;

    try {
      // @ts-expect-error
      parsed = loadSync(getProtoPath(protoPath, file.name))?.nested?.[file.package]?.nested;
    } catch (e) {}

    const spec = generateFile(typeMap, file, request.parameter, parsed);
    return new CodeGeneratorResponse.File({
      name: spec.path,
      content: spec.toString()
    });
  });
  const response = new CodeGeneratorResponse({ file: files, supportedFeatures: Feature.FEATURE_PROTO3_OPTIONAL });
  const buffer = CodeGeneratorResponse.encode(response).finish();
  const write = promisify(process.stdout.write as (buffer: Buffer) => boolean).bind(process.stdout);
  await write(Buffer.from(buffer));
}

main()
  .then(() => {
    process.stderr.write('DONE');
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write('FAILED!');
    process.stderr.write(e.message);
    process.stderr.write(e.stack);
    process.exit(1);
  });
