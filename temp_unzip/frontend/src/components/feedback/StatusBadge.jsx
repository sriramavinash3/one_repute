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
  trialing: { variant: 'brand', label: '14-Day Trial' }
}

export default function StatusBadge({ status }) {
  const entry = map[status] || { variant: 'neutral', label: status }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}
