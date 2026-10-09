const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'data', 'studyhub.db');
const db = new sqlite3.Database(DB_PATH);

function readJsonSubmissionSeed() {
  try {
    const jsonPath = path.join(__dirname, 'data', 'db.json');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.submissions) ? parsed.submissions : [];
  } catch (error) {
    return [];
  }
}

function initializeSubmissionDatabase() {
  return new Promise((resolve, reject) => {
    const seedData = readJsonSubmissionSeed();

    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS submission_reviews (
          id INTEGER PRIMARY KEY,
          assignmentId INTEGER,
          student TEXT,
          title TEXT,
          file TEXT,
          submittedAt TEXT,
          status TEXT DEFAULT 'pending',
          reviewedAt TEXT,
          reviewedBy TEXT
        )`,
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          db.get('SELECT COUNT(*) AS count FROM submission_reviews', (countError, row) => {
            if (countError) {
              reject(countError);
              return;
            }

            if (Number(row.count) === 0 && seedData.length > 0) {
              const stmt = db.prepare(
                `INSERT INTO submission_reviews (id, assignmentId, student, title, file, submittedAt, status, reviewedAt, reviewedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );

              seedData.forEach((submission) => {
                stmt.run(
                  submission.id ?? null,
                  submission.assignmentId ?? null,
                  submission.student ?? '',
                  submission.title ?? '',
                  submission.file ?? '',
                  submission.submittedAt ?? new Date().toISOString(),
                  submission.status ?? 'pending',
                  submission.reviewedAt ?? null,
                  submission.reviewedBy ?? null
                );
              });

              stmt.finalize((finalError) => {
                if (finalError) {
                  reject(finalError);
                } else {
                  resolve();
                }
              });
              return;
            }

            resolve();
          });
        }
      );
    });
  });
}

function getSubmissionRecords() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, assignmentId, student, title, file, submittedAt, status, reviewedAt, reviewedBy
       FROM submission_reviews
       ORDER BY submittedAt DESC`,
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows.map((row) => ({ ...row })));
      }
    );
  });
}

function addSubmissionRecord(record) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO submission_reviews (id, assignmentId, student, title, file, submittedAt, status, reviewedAt, reviewedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id ?? Date.now(),
        record.assignmentId ?? null,
        record.student ?? '',
        record.title ?? '',
        record.file ?? '',
        record.submittedAt ?? new Date().toISOString(),
        record.status ?? 'pending',
        record.reviewedAt ?? null,
        record.reviewedBy ?? null
      ],
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

function updateSubmissionRecord(id, status, reviewedBy) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE submission_reviews
       SET status = ?, reviewedAt = ?, reviewedBy = ?
       WHERE id = ?`,
      [status, new Date().toISOString(), reviewedBy, id],
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports = {
  initializeSubmissionDatabase,
  getSubmissionRecords,
  addSubmissionRecord,
  updateSubmissionRecord
};
