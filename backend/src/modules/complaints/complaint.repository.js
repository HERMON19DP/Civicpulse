const pool = require("../../config/database");

async function createComplaint({
  citizenId,
  title,
  description,
  category,
  address,
  latitude,
  longitude,
  db = pool,
}) {
  const result = await db.query(
    `INSERT INTO complaints (
       citizen_id,
       title,
       description,
       category,
       address,
       latitude,
       longitude
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       id,
       reference_id,
       citizen_id,
       title,
       description,
       category,
       address,
       status,
       priority,
       latitude,
       longitude,
       created_at,
       updated_at`,
    [citizenId, title, description, category, address, latitude, longitude],
  );

  return result.rows[0];
}

async function findComplaintById(id) {
  const result = await pool.query(
    `SELECT
       id,
       reference_id,
       citizen_id,
       title,
       description,
       category,
       address,
       status,
       priority,
       latitude,
       longitude,
       created_at,
       updated_at
     FROM complaints
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function updateComplaintStatus(id, status) {
  const result = await pool.query(
    `UPDATE complaints
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING
       id,
       reference_id,
       citizen_id,
       title,
       description,
       category,
       address,
       status,
       priority,
       latitude,
       longitude,
       created_at,
       updated_at`,
    [status, id],
  );

  return result.rows[0] || null;
}

async function complaintExists(id) {
  const result = await pool.query(
    `SELECT 1
     FROM complaints
     WHERE id = $1`,
    [id],
  );

  return result.rows.length > 0;
}

module.exports = {
  createComplaint,
  findComplaintById,
  updateComplaintStatus,
  complaintExists,
};
