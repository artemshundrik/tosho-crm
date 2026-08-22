import * as React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "./styles.css";

import Buttons from "./cards/buttons";
import Inputs from "./cards/inputs";
import StatusTones from "./cards/status-tones";
import Table from "./cards/table";
import Overlays from "./cards/overlays";
import Elevation from "./cards/elevation";
import Typography from "./cards/typography";
import Colors from "./cards/colors";

const CARDS: Record<string, React.ComponentType> = {
  buttons: Buttons,
  inputs: Inputs,
  "status-tones": StatusTones,
  table: Table,
  overlays: Overlays,
  elevation: Elevation,
  typography: Typography,
  colors: Colors,
};

const name = import.meta.env.VITE_DS_CARD as string;
const Card = CARDS[name];
if (!Card) throw new Error(`Невідома картка: ${name}`);

// MemoryRouter — страховка: частина примітивів (EmptyStateCard) імпортує Link,
// а він без роутера кидає виняток.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MemoryRouter>
      <Card />
    </MemoryRouter>
  </React.StrictMode>
);
