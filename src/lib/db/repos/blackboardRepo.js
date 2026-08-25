import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
const now = () => new Date().toISOString();
const map = (row) => { if (!row) return null; return { ...row, tags: parseJson(row.tags, []), metadata: parseJson(row.metadata, {}), validityScore: Number(row.validityScore), confidenceScore: Number(row.confidenceScore), revision: Number(row.revision || 0) }; };
export async function getBlackboardEntries(filter = {}) { const db = await getAdapter(), clauses=[],args=[]; for (const k of ["swarmId","authorBotId","category"]) if(filter[k]!==undefined){clauses.push(`${k}=?`);args.push(filter[k]);} if(filter.minScore!==undefined){clauses.push("validityScore>=?");args.push(filter.minScore);} return db.all(`SELECT * FROM blackboard ${clauses.length?`WHERE ${clauses.join(" AND ")}`:""} ORDER BY updatedAt DESC`,args).map(map); }
export async function getBlackboardEntryById(id) { const db=await getAdapter(); return map(db.get("SELECT * FROM blackboard WHERE id=?",[id])); }
export async function createBlackboardEntry(data) { if(!data?.content) throw new Error("Blackboard content is required"); const db=await getAdapter(),t=now(),e={id:data.id||uuidv4(),swarmId:data.swarmId||null,authorBotId:data.authorBotId||null,content:data.content,tags:data.tags||[],category:data.category||"fact",validityScore:data.validityScore??1,confidenceScore:data.confidenceScore??0,metadata:data.metadata||{},source:data.source||null,revision:0,createdAt:t,updatedAt:t,expiresAt:data.expiresAt||null}; db.run("INSERT INTO blackboard (id,swarmId,authorBotId,content,tags,category,validityScore,confidenceScore,metadata,source,revision,createdAt,updatedAt,expiresAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[e.id,e.swarmId,e.authorBotId,e.content,stringifyJson(e.tags),e.category,e.validityScore,e.confidenceScore,stringifyJson(e.metadata),e.source,e.revision,e.createdAt,e.updatedAt,e.expiresAt]); return e; }
export async function updateBlackboardEntry(id, updates, expectedRevision, authorId = null) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new RangeError("expectedRevision must be a non-negative integer");
  }
  const db = await getAdapter();
  let updated = null;
  db.transaction(() => {
    const existing = map(db.get("SELECT * FROM blackboard WHERE id=?", [id]));
    if (!existing) return;
    const e = {
      ...existing,
      ...updates,
      revision: expectedRevision + 1,
      updatedAt: now(),
    };
    const result = db.run(
      "UPDATE blackboard SET content=?,tags=?,category=?,validityScore=?,confidenceScore=?,metadata=?,source=?,updatedAt=?,expiresAt=?,revision=? WHERE id=? AND revision=?",
      [e.content, stringifyJson(e.tags), e.category, e.validityScore, e.confidenceScore, stringifyJson(e.metadata), e.source, e.updatedAt, e.expiresAt, e.revision, id, expectedRevision],
    );
    if (result.changes !== 1) throw new Error("Blackboard entry changed concurrently");
    db.run(
      "INSERT INTO blackboardRevisions (id,entryId,revision,content,tags,category,validityScore,authorBotId,changeType,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [uuidv4(), id, e.revision, e.content, stringifyJson(e.tags), e.category, e.validityScore, authorId, "update", e.updatedAt],
    );
    updated = e;
  });
  return updated;
}
export async function deleteBlackboardEntry(id) { const db=await getAdapter();db.run("DELETE FROM blackboard WHERE id=?",[id]);return true; }
export async function searchBlackboard(query, tags, category, minScore = 0) { const db=await getAdapter(), clauses=["(content LIKE ? OR tags LIKE ?)","validityScore>=?"], args=[`%${query||""}%`,`%${query||""}%`,minScore]; if(category){clauses.push("category=?");args.push(category);} return db.all(`SELECT * FROM blackboard WHERE ${clauses.join(" AND ")} ORDER BY validityScore DESC,updatedAt DESC`,args).filter((e)=>!tags?.length||tags.every((tag)=>parseJson(e.tags,[]).includes(tag))).map(map); }
export async function linkBlackboardEntries(sourceId,targetId,relationType="related",weight=1) { const db=await getAdapter(); db.run("INSERT INTO blackboardLinks (id,sourceId,targetId,relationType,weight,metadata,createdAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(sourceId,targetId,relationType) DO UPDATE SET weight=excluded.weight",[uuidv4(),sourceId,targetId,relationType,weight,"{}",now()]); return getBlackboardLinks(sourceId); }
export async function getBlackboardLinks(entryId) { const db=await getAdapter(); return db.all("SELECT * FROM blackboardLinks WHERE sourceId=? OR targetId=?",[entryId,entryId]).map((row)=>({...row,metadata:parseJson(row.metadata,{})})); }
export async function getBlackboardGraph(swarmId) { const db=await getAdapter(); return { entries: await getBlackboardEntries({swarmId}), links: db.all("SELECT l.* FROM blackboardLinks l JOIN blackboard b ON b.id=l.sourceId WHERE b.swarmId=?",[swarmId]) }; }
export async function getEntryRevisions(entryId) { const db=await getAdapter(); return db.all("SELECT * FROM blackboardRevisions WHERE entryId=? ORDER BY revision ASC",[entryId]).map((r)=>({...r,tags:parseJson(r.tags,[])})); }
