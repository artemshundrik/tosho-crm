/**
 * Межа між CRM і Instagram: надсилання.
 *
 * Тестова заявка йде в імітацію, а справжній клієнт поки отримує чесну помилку:
 * заявка лишається на менеджері, а повідомлення позначене як не надіслане.
 * Коли з'явиться доступ до Meta, реалізація додається у `sendToMeta`, і більше
 * нічого в логіці заявок не міняється.
 */
export type TransportResult =
  | { ok: true; externalId: string }
  | { ok: false; error: string; authFailed?: boolean };

export type SendInput = { recipientId: string; text: string; isTest: boolean };

/** Рядок, за яким імітація вдає збій: так перевіряється стан «Не надіслано». */
export const TEST_FAILURE_MARKER = "!fail";

export function sendTestMessage(input: Pick<SendInput, "text">): TransportResult {
  if (input.text.includes(TEST_FAILURE_MARKER)) {
    return { ok: false, error: "Тестовий збій надсилання" };
  }
  return { ok: true, externalId: `test-out-${crypto.randomUUID()}` };
}

async function sendToMeta(): Promise<TransportResult> {
  return { ok: false, error: "Instagram ще не підключено" };
}

export async function sendInstagramMessage(input: SendInput): Promise<TransportResult> {
  return input.isTest ? sendTestMessage(input) : sendToMeta();
}
