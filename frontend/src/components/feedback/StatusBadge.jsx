import Badge from '../ui/badge'

const map = {
  pending: { variant: 'warning', label: 'Pending' },
  suggested: { variant: 'brand', label: 'AI Reply Ready' },
  reply_pending: { variant: 'brand', label: 'AI Reply Ready' },
  responded: { variant: 'success', label: 'Responded' },
  escalated: { variant: 'danger', label: 'Escalated' },
  failed: { variant: 'danger', label: 'Failed' },
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'neutral', label: 'Inactive' },
  trialing: { variant: 'brand', label: '14-Day Trial' },
  level_1_pending: { variant: 'warning', label: 'L1 Pending' },
  level_2_pending: { variant: 'danger', label: 'L2 Pending' },
  level_3_pending: { variant: 'danger', label: 'L3 Pending' },
  resolved: { variant: 'success', label: 'Escalation Resolved' },
  completed: { variant: 'neutral', label: 'Escalation Completed' }
}

export default function StatusBadge({ status }) {
  const entry = map[status] || { variant: 'neutral', label: status }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}
