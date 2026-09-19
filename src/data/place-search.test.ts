import test from 'node:test';
import assert from 'node:assert/strict';
import {localPlaceMatches,parseNominatimResults} from './place-search';

test('local Korean place search works without the network',()=>{assert.equal(localPlaceMatches('부산 태종대')[0].name,'부산');assert(localPlaceMatches('진주성').some(place=>place.name==='진주성'));assert.deepEqual(localPlaceMatches(''),[]);});
test('Nominatim results are validated and converted',()=>{const result=parseNominatimResults([{display_name:'광안리해수욕장, 부산, 대한민국',lat:'35.153',lon:'129.118',boundingbox:['35.14','35.16','129.10','129.13']},{lat:'bad',lon:'0'}]);assert.equal(result.length,1);assert.equal(result[0].name,'광안리해수욕장');assert.deepEqual(result[0].bounds,{south:35.14,north:35.16,west:129.10,east:129.13});});
