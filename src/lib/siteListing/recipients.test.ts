import { describe, expect, it } from "vitest";

import { pickSiteListingRecipients } from "./recipients";

const owner = { userId: "owner", accessRole: "owner" };
const ceo = { userId: "ceo", accessRole: "admin" };
const it_ = { userId: "it", accessRole: "member" };

describe("кому сповіщення про нові моделі для сайту", () => {
  it("немає збереженого вибору — лише власник, а не всі з доступом", () => {
    expect(pickSiteListingRecipients([owner, ceo, it_], null)).toEqual([owner]);
  });

  it("роль власника читається без огляду на регістр і пробіли", () => {
    const shouting = { userId: "o2", accessRole: " Owner " };
    expect(pickSiteListingRecipients([shouting, ceo], null)).toEqual([shouting]);
  });

  it("збережений вибір — рівно ті, кого вибрали", () => {
    expect(pickSiteListingRecipients([owner, ceo, it_], ["ceo", "it"])).toEqual([ceo, it_]);
  });

  it("порожній вибір — нікому: це рішення, а не відсутність рішення", () => {
    expect(pickSiteListingRecipients([owner, ceo], [])).toEqual([]);
  });

  it("вибраний, але без доступу чи звільнений, випадає сам", () => {
    // У списку допустимих його вже немає — вибір не повертає людину назад.
    expect(pickSiteListingRecipients([owner], ["owner", "gone"])).toEqual([owner]);
  });
});
