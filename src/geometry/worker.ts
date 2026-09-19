import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url';
import {generateModel,fusedMesh,partitionParts} from './model';
import {binarySTL,threeMF} from './export';
const ready=Module({locateFile:()=>wasmURL}).then(api=>{api.setup();return api;});
self.onmessage=async(e)=>{const {id,type,payload}=e.data;try{const api=await ready;let result;if(type==='generate')result=generateModel(api,payload.data,payload.bounds,payload.route,payload.settings,payload.area);else if(type==='stl')result=binarySTL(fusedMesh(api,payload));else result=threeMF(partitionParts(api,payload));self.postMessage({id,result});}catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}};
