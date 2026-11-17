import assert from "node:assert/strict";
import { test } from "node:test";
import { pageDimensions, normalizePrint, defaultPrint } from "../src/posters/paper.ts";
test("normaliza rascunhos antigos e margens inválidas",()=>{
  assert.deepEqual(normalizePrint(undefined),defaultPrint);
  assert.equal(normalizePrint({margin:NaN}).margin,5);
  assert.equal(normalizePrint({margin:-5}).margin,0);
  assert.equal(normalizePrint({margin:100}).margin,20);
  assert.equal(normalizePrint({paper:"INVALID"}).paper,"A4");
});
test("mantém dimensões físicas dos cinco papéis nas duas orientações",()=>{
  for(const [paper,short,long] of [["A2",420,594],["A3",297,420],["A4",210,297],["A5",148,210],["A6",105,148]]){
    assert.deepEqual(pageDimensions({...defaultPrint,paper}),{width:short,height:long});
    assert.deepEqual(pageDimensions({...defaultPrint,paper,orientation:"landscape"}),{width:long,height:short});
  }
});
