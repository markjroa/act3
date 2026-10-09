const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  initializeSubmissionDatabase,
  getSubmissionRecords,
  addSubmissionRecord,
  updateSubmissionRecord
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data', 'db.json');

const defaultDatabase = {
  users: [
    { username: 'student', password: 'student123', name: 'Aisha Morgan', role: 'student' },
    { username: 'lecturer', password: 'lecturer123', name: 'Dr. Daniel Brooks', role: 'lecturer' },
    { username: 'admin', password: 'admin123', name: 'Emma Patel', role: 'admin' }
  ],
  courses: [
    { id: 1, code: 'CS101', title: 'Introduction to Programming', instructor: 'Dr. Daniel Brooks', students: ['student'], schedule: 'Mon/Wed 09:00', room: 'Lab 2', color: 'blue' },
    { id: 2, code: 'BIO220', title: 'Cell Biology', instructor: 'Dr. Matilda Reed', students: ['student'], schedule: 'Tue/Thu 11:00', room: 'Room 12', color: 'green' },
    { id: 3, code: 'ENG205', title: 'Technical Writing', instructor: 'Prof. Lucy Stone', students: ['student'], schedule: 'Fri 10:00', room: 'Room 5', color: 'orange' }
  ],
  announcements: [
    { id: 1, title: 'Midterm timetable published', message: 'The midterm timetable has been uploaded. Please check the course portal before Friday.', author: 'Admin Office', date: '2026-10-07' },
    { id: 2, title: 'Assignment 2 reminder', message: 'Assignment 2 for CS101 is due on Friday at 23:59. Submit your work before the deadline.', author: 'Dr. Daniel Brooks', date: '2026-10-08' },
    { id: 3, title: 'Library lab access extended', message: 'The computer lab remains open until 19:00 for programming practice sessions.', author: 'Student Support', date: '2026-10-09' }
  ],
  assignments: [
    { id: 1, title: 'Programming Exercise 1', course: 'CS101', due: '2026-10-12', status: 'Open', description: 'Write a short console program that calculates discounts.' },
    { id: 2, title: 'Research Summary', course: 'BIO220', due: '2026-10-16', status: 'Open', description: 'Submit a 500-word review of cell membrane transport.' },
    { id: 3, title: 'Report Draft', course: 'ENG205', due: '2026-10-18', status: 'Open', description: 'Prepare a first draft of the technical report for peer review.' }
  ],
  grades: [
    { id: 1, course: 'CS101', assessment: 'Quiz 1', score: 88, grade: 'A' },
    { id: 2, course: 'CS101', assessment: 'Lab Task 1', score: 91, grade: 'A' },
    { id: 3, course: 'BIO220', assessment: 'Report', score: 84, grade: 'B' },
    { id: 4, course: 'ENG205', assessment: 'Draft Review', score: 78, grade: 'B+' }
  ],
  submissions: []
};

function loadDatabase() {
  try {
    const file = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(file);
    return parsed;
  } catch (error) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(defaultDatabase, null, 2));
    return structuredClone(defaultDatabase);
  }
}

let db = loadDatabase();

async function refreshSubmissionData() {
  db.submissions = await getSubmissionRecords();
}

function saveDatabase() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function getLoggedInUser(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader.split(';').find((item) => item.trim().startsWith('studyhub_user='));
  if (!cookie) {
    return null;
  }
  const username = decodeURIComponent(cookie.split('=')[1]);
  return db.users.find((user) => user.username === username) || null;
}

function requireAuth(req, res, next) {
  const user = getLoggedInUser(req);
  if (!user) {
    return res.redirect('/login');
  }
  req.user = user;
  next();
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).send('Access denied. You do not have permission to access this page.');
    }
    next();
  };
}

function getUserCourses(user) {
  if (!user) return [];
  if (user.role === 'admin') {
    return db.courses;
  }
  return db.courses.filter((course) => course.students.includes(user.username));
}

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const user = getLoggedInUser(req);
  if (user) {
    return res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
  }
  res.render('login', { error: '', title: 'StudyHub Login' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(
    (entry) => entry.username === username && entry.password === password
  );

  if (!user) {
    return res.render('login', {
      error: 'Invalid username or password. Please try again.',
      title: 'StudyHub Login'
    });
  }

  res.setHeader(
    'Set-Cookie',
    `studyhub_user=${encodeURIComponent(user.username)}; Path=/; HttpOnly`
  );

  return res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'studyhub_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/login');
});

app.get('/dashboard', requireAuth, (req, res) => {
  const courses = getUserCourses(req.user);
  const stats = {
    courses: courses.length,
    assignments: db.assignments.length,
    announcements: db.announcements.length,
    average: db.grades.reduce((total, item) => total + item.score, 0) / db.grades.length
  };

  res.render('dashboard', {
    title: 'Student Dashboard',
    user: req.user,
    courses,
    stats,
    announcements: db.announcements.slice(0, 3)
  });
});

app.get('/courses', requireAuth, (req, res) => {
  const courses = getUserCourses(req.user);
  res.render('courses', {
    title: 'My Courses',
    user: req.user,
    courses
  });
});

app.get('/assignments', requireAuth, (req, res) => {
  res.render('assignments', {
    title: 'Assignments',
    user: req.user,
    assignments: db.assignments
  });
});

app.post('/assignments/:id/submit', requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);
  const assignment = db.assignments.find((item) => item.id === assignmentId);

  if (!assignment) {
    return res.status(404).send('Assignment not found.');
  }

  const submittedAt = new Date().toISOString();
  const submission = {
    id: Date.now(),
    assignmentId,
    student: req.user.username,
    title: assignment.title,
    file: req.body.file || 'Uploaded via StudyHub portal',
    submittedAt,
    status: 'pending'
  };

  await addSubmissionRecord(submission);
  await refreshSubmissionData();
  saveDatabase();

  return res.redirect('/assignments?success=1');
});

app.get('/grades', requireAuth, (req, res) => {
  res.render('grades', {
    title: 'Grades',
    user: req.user,
    grades: db.grades
  });
});

app.get('/announcements', requireAuth, (req, res) => {
  res.render('announcements', {
    title: 'Announcements',
    user: req.user,
    announcements: db.announcements
  });
});

app.get('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  await refreshSubmissionData();

  const summary = {
    totalUsers: db.users.length,
    totalCourses: db.courses.length,
    totalAssignments: db.assignments.length,
    totalSubmissions: db.submissions.length
  };

  res.render('admin', {
    title: 'Admin Dashboard',
    user: req.user,
    summary,
    users: db.users,
    courses: db.courses,
    submissions: db.submissions
  });
});

app.post('/admin/submissions/:id/decision', requireAuth, requireRole('admin'), async (req, res) => {
  const submissionId = Number(req.params.id);
  const submission = db.submissions.find((item) => item.id === submissionId);

  if (!submission) {
    return res.status(404).send('Submission not found.');
  }

  const action = req.body.action;
  const status = action === 'accept' ? 'accepted' : 'rejected';

  await updateSubmissionRecord(submissionId, status, req.user.username);
  await refreshSubmissionData();
  saveDatabase();

  return res.redirect('/admin');
});

initializeSubmissionDatabase()
  .then(async () => {
    await refreshSubmissionData();
    app.listen(PORT, () => {
      console.log(`StudyHub app running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize the submission database:', error);
    process.exit(1);
  });
