import { describe, expect, it } from "vitest";

import { parseTotobiSizeTable } from "./totobiSizeTable";

/**
 * Розмітка — скорочені справжні сторінки totobi.com.ua (07.10.2026): реглан
 * Heavy Blend, дитяча футболка Beagle, панама Summer. Пробіли й табуляції
 * CS-Cart лишені, бо саме на них ламаються наївні регулярки.
 */
const wrap = (rows: string) => `
<div class="product-block-note table_sizez">
  <h3>Таблиця розмірів</h3>
  <table>${rows}</table>
  <div class="description_after_details">Для текстилю допустиме коливання від технічних параметрів +- 5%</div>
</div>`;

const REGLAN = wrap(`
  <tr>
    <th rowspan="2" class="size_icon"><img src="images/size.jpg"></th>
    <th>S
    </th>
    <th>M
    </th>
  </tr>
  <tr>
    <td>69/51</td>
    <td>71/56</td>
  </tr>
  <tr>
    <td class="size_icon">В ящику <i class="fa fa-cube"></i></td>
    <td>36</td>
    <td>36</td>
  </tr>`);

const KIDS = wrap(`
  <tr><th rowspan="2" class="size_icon"><img src="images/size.jpg"></th><th>1Y/2Y</th><th>3Y/4Y</th></tr>
  <tr><td>39cm/29cm</td><td>43cm/32cm</td></tr>
  <tr><td class="size_icon">В ящику <i class="fa fa-cube"></i></td><td>100</td><td>100</td></tr>`);

const PANAMA = wrap(`
  <tr><th>M/L</th><th>XL/2XL</th></tr>
  <tr><td>58 см</td><td>60 см</td></tr>
  <tr><td>0</td><td>0</td></tr>`);

describe("таблиця розмірів зі сторінки Тотобі", () => {
  it("силует A/B: довжина й ширина, рядок «В ящику» відкинуто", () => {
    expect(parseTotobiSizeTable(REGLAN)).toEqual({
      sizes: ["S", "M"],
      rows: [{ label: "Довжина / ширина, см", values: ["69/51", "71/56"] }],
    });
  });

  it("одиниця з клітинок зникає — вона вже в підписі", () => {
    expect(parseTotobiSizeTable(KIDS)?.rows[0].values).toEqual(["39/29", "43/32"]);
  });

  it("без силуету — нейтральний підпис, а другий рядок без підпису — це ящик", () => {
    expect(parseTotobiSizeTable(PANAMA)).toEqual({
      sizes: ["M/L", "XL/2XL"],
      rows: [{ label: "Розмір", values: ["58 см", "60 см"] }],
    });
  });

  it("сторінка без таблиці", () => {
    expect(parseTotobiSizeTable("<html><body>Кухоль</body></html>")).toBeNull();
  });
});
