import React from "react";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Демо дані
const players = [
  { id: 1, name: "Олександр Зінченко", role: "Defender", status: "active", number: 17, avatar: "" },
  { id: 2, name: "Михайло Мудрик", role: "Winger", status: "injured", number: 10, avatar: "" },
  { id: 3, name: "Андрій Лунін", role: "Goalkeeper", status: "active", number: 1, avatar: "" },
];

export function PlayersTable() {
  return (
    <div className="rounded-[var(--radius-section)] border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead>Гравець</TableHead>
            <TableHead>Позиція</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Дії</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => (
            <TableRow key={player.id} className="hover:bg-muted/30 transition-colors">
              <TableCell className="font-medium text-muted-foreground">{player.number}</TableCell>
              
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={player.avatar} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {player.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{player.name}</span>
                    <span className="text-[10px] text-muted-foreground">ID: {player.id}</span>
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-normal text-muted-foreground bg-background">{player.role}</Badge>
                </div>
              </TableCell>
              
              <TableCell>
                {player.status === 'active' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 hover:bg-emerald-500/25">У строю</Badge>
                ) : (
                    <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/20 hover:bg-destructive/25">Травма</Badge>
                )}
              </TableCell>
              
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
