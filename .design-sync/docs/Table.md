---
category: Data
---

Таблиця. Числа — праворуч і з `tabular-nums`, інакше суми стрибають при перерахунку.

ВКЛАДЕНІСТЬ ВАЖЛИВА: усі заголовки — це `TableHead` В ОДНОМУ `TableRow` всередині `TableHeader`. Якщо покласти кожен заголовок в окремий `TableRow`, шапка розповзеться на кілька рядків і перестане стояти над своїми колонками.

```jsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Номер</TableHead>
      <TableHead>Замовник</TableHead>
      <TableHead className="text-right">Сума, ₴</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell className="tabular-nums">TS-0826-0009</TableCell>
      <TableCell>ТОВ «Приклад»</TableCell>
      <TableCell className="text-right tabular-nums">48 200,00</TableCell>
    </TableRow>
  </TableBody>
</Table>
```
