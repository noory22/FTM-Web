import {
  Activity,
  ClipboardList,
  FilePlus,
  FileInput,
  FileText,
  Gauge,
  Home,
  Trash2,
  Settings,
} from 'lucide-react';

export const navigationGroups = [
  {
    // title: 'Run',
    items: [
      { label: 'Dashboard', path: '/main-menu', icon: Home, roles: ['admin', 'operator'] },
      { label: 'Manual Mode', path: '/manual-mode', icon: Gauge, roles: ['admin', 'operator'], action: 'manual', blockedByEmergency: true },
      { label: 'Process Logs', path: '/process-logs', icon: FileText, roles: ['admin', 'operator'] },
    ],
  },
  {
    // title: 'Settings',
    items: [
      { label: 'Settings', path: '/settings', icon: Settings, roles: ['admin', 'operator'] }
    ]
  },
  {
    // title: 'Point Tests',
    items: [
      {
        label: 'Test Selection',
        icon: ClipboardList,
        roles: ['admin', 'operator'],
        children: [
          {
            label: '2-Point Test',
            path: '/test-action/2-point',
            icon: ClipboardList,
            roles: ['admin', 'operator'],
            children: [
              { label: 'Create Configuration', path: '/create-config/2-point', icon: FilePlus, roles: ['admin'] },
              { label: 'Continue to Process Mode', path: '/load-config/2-point', icon: FileInput, roles: ['admin', 'operator'] },
              { label: 'Delete Configuration', path: '/delete-config/2-point', icon: Trash2, roles: ['admin'], danger: true },
            ],
          },
          {
            label: '3-Point Test',
            path: '/test-action/3-point',
            icon: ClipboardList,
            roles: ['admin', 'operator'],
            children: [
              { label: 'Create Configuration', path: '/create-config/3-point', icon: FilePlus, roles: ['admin'] },
              { label: 'Continue to Process Mode', path: '/load-config/3-point', icon: FileInput, roles: ['admin', 'operator'] },
              { label: 'Delete Configuration', path: '/delete-config/3-point', icon: Trash2, roles: ['admin'], danger: true },
            ],
          },
        ],
      },
    ],
  },
];

export const pageTitles = {
  '/main-menu': 'Dashboard',
  '/handle-config/load': 'Load Configuration',
  '/handle-config/delete': 'Delete Configurations',
  '/manual-mode': 'Manual Mode',
  '/process-mode': 'Process Mode',
  '/process-logs': 'Process Logs',
  '/test-selection': 'Test Selection',
  '/test-action/2-point': '2-Point Test Actions',
  '/test-action/3-point': '3-Point Test Actions',
  '/create-config': 'Create Configuration',
  '/create-config/2-point': 'Create 2-Point Configuration',
  '/create-config/3-point': 'Create 3-Point Configuration',
  '/load-config/2-point': 'Load 2-Point Configuration',
  '/load-config/3-point': 'Load 3-Point Configuration',
  '/delete-config/2-point': 'Delete 2-Point Configuration',
  '/delete-config/3-point': 'Delete 3-Point Configuration',
  '/settings': 'Load Cell Calibration',
};

// [LOGIN BYPASSED] Role filter function preserved but no longer used
// const filterItemsByRole = (items, role) => (
//   items
//     .filter((item) => item.roles.includes(role))
//     .map((item) => {
//       if (!item.children) return item;
//       return {
//         ...item,
//         children: filterItemsByRole(item.children, role),
//       };
//     })
//     .filter((item) => !item.children || item.children.length > 0)
// );

// [LOGIN BYPASSED] Returns ALL navigation groups — no role filtering applied
export const getVisibleNavigationGroups = (role) => {
  // [LOGIN BYPASSED] Old role-based logic commented out:
  // if (!role) return [];
  // return navigationGroups
  //   .map((group) => ({ ...group, items: filterItemsByRole(group.items, role) }))
  //   .filter((group) => group.items.length > 0);

  return navigationGroups; // Return everything, no filtering
};

export const getVisibleNavigationItems = (role) => {
  const flatten = (items) => items.flatMap((item) => [
    item,
    ...(item.children ? flatten(item.children) : []),
  ]);

  return getVisibleNavigationGroups(role).flatMap((group) => flatten(group.items));
};
