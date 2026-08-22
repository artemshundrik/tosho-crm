import * as React from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Button, Badge } from "tosho-crm";
import { Cell } from "./_shared";

export function Basic() {
  return (
    <Cell>
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Активні прорахунки</CardTitle>
          <CardDescription>16 чекають погодження</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">64</p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button size="sm">Відкрити</Button>
          <Badge tone="warning" size="sm">3 протерміновані</Badge>
        </CardFooter>
      </Card>
    </Cell>
  );
}
