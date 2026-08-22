import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "tosho-crm";
import { Cell } from "./_shared";

export function Basic() {
  return (
    <Cell>
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Товари</TabsTrigger>
          <TabsTrigger value="design">Дизайн</TabsTrigger>
          <TabsTrigger value="chat">Обговорення</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="pt-3 text-sm text-muted-foreground">12 позицій, 13 тиражів</TabsContent>
        <TabsContent value="design" className="pt-3 text-sm text-muted-foreground">Візуал погоджено</TabsContent>
      </Tabs>
    </Cell>
  );
}
