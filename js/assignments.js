// ASSIGNMENTS — uses the shared grade-items module (js/grade-items.js)
bootGradeItemsPage({
  types: [{ type: 'assignment', label: 'Assignment', plural: 'Assignments', add: '+ New Assignment', dateLabel: 'Due Date *' }],
  fields: { description: true, instructions: true, attachment: true, submission: true }
});
