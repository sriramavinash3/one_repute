import Button from '../../components/ui/button'
import Input from '../../components/ui/input'
import { Card } from '../../components/ui/card'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-slatey-500">Control workspace branding and alerts.</p>
      </div>
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Input placeholder="Workspace name" />
          <Input placeholder="Notification email" />
        </div>
        <Button className="mt-4">Save settings</Button>
      </Card>
    </div>
  )
}
