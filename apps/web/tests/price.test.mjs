import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePrice, priceLayout, units } from "../src/posters/price.ts";

test("separa preços brasileiros sem converter valores monetários para ponto flutuante", () => {
  for (const [input, whole, cents] of [
    ["R$ 2,49", "2", "49"], ["6,99", "6", "99"], ["19,90", "19", "90"],
    ["129,90", "129", "90"], ["1.299,00", "1.299", "00"], ["1299", "1.299", "00"],
    ["0006,9", "6", "90"], ["0,01", "0", "01"], ["999999999999,99", "999.999.999.999", "99"],
  ]) {
    assert.deepEqual(parsePrice(input), { symbol: "R$", whole, cents });
  }
});

test("rejeita valor incompleto, notação ambígua e entradas fora do limite", () => {
  for (const input of ["", "6,", "-6,99", "6.99", "12.99,00", "1,005", "1e3", "1000000000000"]) {
    assert.equal(parsePrice(input), null);
  }
});

test("mantém o inteiro dominante e reserva espaço para os centavos e a unidade", () => {
  for (const value of ["2,49", "19,90", "129,90", "1.299,00", "999.999.999.999,99"]) {
    const { whole } = parsePrice(value);
    for (const unit of units) {
      for (const scale of [0.7, 1, 1.4]) {
        const layout = priceLayout(whole, unit, scale);
        assert.ok(layout.width <= 336 + 1e-9, value + " " + unit);
        assert.ok(layout.size > layout.unitSize);
        assert.ok(layout.wholeWidth > 0 && layout.symbolWidth > 0 && layout.sideWidth > 0);
        assert.ok(layout.sideWidth >= layout.unitSize * unit.length * 0.76 - 1e-9);
      }
    }
  }
});
