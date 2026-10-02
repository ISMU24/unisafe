import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../ThemeContext';

const CATEGORY_META = {
  Security:  { color: '#1565C0', icon: '🛡️', label: 'Security'  },
  Fire:      { color: '#D32F2F', icon: '🔥', label: 'Fire'      },
  Ambulance: { color: '#2E7D32', icon: '🚑', label: 'Ambulance' },
  Other:     { color: '#E65100', icon: '📋', label: 'Other'     },
};

// Status vocabularies differ per entity, so this covers all of them:
//   incidents  Submitted | Received | Under Review | Assigned | Responding | Resolved | Closed | Cancelled
//   SOS        Active | Acknowledged | Responding | Resolved | Cancelled
//   assistance Pending | Assigned | In Progress | Completed | Cancelled
//   appeals    Submitted | Under Review | Additional Info Required | Approved | Rejected | Closed
// Any status not listed falls back to a neutral grey badge rather than showing
// a blank or an incorrect colour.
const STATUS_LIGHT = {
  Submitted:   { color: '#D32F2F', icon: '🔴', label: 'Submitted'   },
  Open:        { color: '#D32F2F', icon: '🔴', label: 'Open'        },
  Active:      { color: '#D32F2F', icon: '🔴', label: 'Active'      },
  Pending:     { color: '#D32F2F', icon: '🔴', label: 'Pending'     },
  Received:    { color: '#E65100', icon: '🟠', label: 'Received'    },
  Acknowledged:{ color: '#E65100', icon: '🟠', label: 'Acknowledged'},
  Assigned:    { color: '#E65100', icon: '🟡', label: 'Assigned'    },
  Responding:  { color: '#E65100', icon: '🟡', label: 'Responding'  },
  'In Progress':{ color: '#E65100', icon: '🟡', label: 'In Progress' },
  'Under Review': { color: '#E65100', icon: '🟡', label: 'Under Review' },
  'Additional Info Required': { color: '#E65100', icon: '🟡', label: 'More Info Needed' },
  Resolved:    { color: '#2E7D32', icon: '🟢', label: 'Resolved'    },
  Approved:    { color: '#2E7D32', icon: '🟢', label: 'Approved'    },
  Completed:   { color: '#2E7D32', icon: '🟢', label: 'Completed'   },
  Rejected:    { color: '#C62828', icon: '🔴', label: 'Rejected'    },
  Cancelled:   { color: '#9E9E9E', icon: '⚪', label: 'Cancelled'   },
  Closed:      { color: '#9E9E9E', icon: '⚪', label: 'Closed'      },
};

const STATUS_DARK = {
  Submitted:   { color: '#EF5350', icon: '🔴', label: 'Submitted'   },
  Open:        { color: '#EF5350', icon: '🔴', label: 'Open'        },
  Active:      { color: '#EF5350', icon: '🔴', label: 'Active'      },
  Pending:     { color: '#EF5350', icon: '🔴', label: 'Pending'     },
  Received:    { color: '#FFB74D', icon: '🟠', label: 'Received'    },
  Acknowledged:{ color: '#FFB74D', icon: '🟠', label: 'Acknowledged'},
  Assigned:    { color: '#FFB74D', icon: '🟡', label: 'Assigned'    },
  Responding:  { color: '#FFB74D', icon: '🟡', label: 'Responding'  },
  'In Progress':{ color: '#FFB74D', icon: '🟡', label: 'In Progress' },
  'Under Review': { color: '#FFB74D', icon: '🟡', label: 'Under Review' },
  'Additional Info Required': { color: '#FFB74D', icon: '🟡', label: 'More Info Needed' },
  Resolved:    { color: '#66BB6A', icon: '🟢', label: 'Resolved'    },
  Approved:    { color: '#66BB6A', icon: '🟢', label: 'Approved'    },
  Completed:   { color: '#66BB6A', icon: '🟢', label: 'Completed'   },
  Rejected:    { color: '#EF5350', icon: '🔴', label: 'Rejected'    },
  Cancelled:   { color: '#9E9E9E', icon: '⚪', label: 'Cancelled'   },
  Closed:      { color: '#9E9E9E', icon: '⚪', label: 'Closed'      },
};

export default function CategoryBadge({ category, size = 'sm' }) {
  const meta = CATEGORY_META[category] || CATEGORY_META['Other'];
  const large = size === 'lg';
  return (
    <View style={[s.badge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55', paddingHorizontal: large ? 14 : 8, paddingVertical: large ? 6 : 3 }]}>
      <Text style={[s.text, { color: meta.color, fontSize: large ? 14 : 11 }]}>{meta.icon} {meta.label}</Text>
    </View>
  );
}

export function StatusBadge({ status, size = 'sm' }) {
  const { isDark } = useTheme();
  const set = isDark ? STATUS_DARK : STATUS_LIGHT;
  const meta = set[status] || { color: '#9E9E9E', icon: '⚪', label: status };
  const large = size === 'lg';
  return (
    <View style={[s.badge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55', paddingHorizontal: large ? 14 : 8, paddingVertical: large ? 6 : 3 }]}>
      <Text style={[s.text, { color: meta.color, fontSize: large ? 14 : 11 }]}>{meta.icon} {meta.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  text:  { fontWeight: '700' },
});
