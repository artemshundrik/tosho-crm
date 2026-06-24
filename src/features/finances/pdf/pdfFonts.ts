import { Font } from "@react-pdf/renderer";
import RobotoRegular from "@/assets/fonts/Roboto-Regular.ttf?url";
import RobotoBold from "@/assets/fonts/Roboto-Bold.ttf?url";

// Реєстрація шрифту для @react-pdf (браузер). Roboto має повну кирилицю.
// Викликати один раз перед рендером PDF. Ідемпотентна.
let registered = false;

export function ensurePdfFonts() {
  if (registered) return;
  Font.register({
    family: "Roboto",
    fonts: [
      { src: RobotoRegular, fontWeight: "normal" },
      { src: RobotoBold, fontWeight: "bold" },
    ],
  });
  // Без переносів по складах (латинські правила ламали б українські слова).
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
