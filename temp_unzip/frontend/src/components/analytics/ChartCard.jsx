import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

export default function ChartCard({ title, action, children }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
