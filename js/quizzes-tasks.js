// QUIZZES & CLASSROOM TASKS — uses the shared grade-items module (js/grade-items.js)
bootGradeItemsPage({
  types: [
    { type: 'quiz', label: 'Quiz', plural: 'Quizzes', add: '+ New Quiz', dateLabel: 'Date *' },
    { type: 'task', label: 'Task', plural: 'Tasks', add: '+ New Task', dateLabel: 'Due Date *' }
  ],
  totalOptional: ['task'],
  fields: { descriptionFor: ['task'] }
});
