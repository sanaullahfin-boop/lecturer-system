// PRESENTATIONS — uses the shared grade-items module (js/grade-items.js)
bootGradeItemsPage({
  types: [{ type: 'presentation', label: 'Presentation Round', plural: 'Presentation Rounds', add: '+ New Presentation Round', dateLabel: 'Date *' }],
  fields: { description: true }
});
