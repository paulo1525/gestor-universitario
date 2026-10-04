/// <reference types="@cloudflare/workers-types" />

export function announcementAudienceWhere(management: boolean): string {
  return management ? "1=1" : "(a.audience_scope='all' OR (a.audience_scope='year' AND (a.audience_year IS NULL OR u_view.study_year IS NULL OR a.audience_year=u_view.study_year)) OR (a.audience_scope='unit' AND (a.audience_unit_id IS NULL OR EXISTS (SELECT 1 FROM curricular_unit_representatives cur_view WHERE cur_view.curricular_unit_id=a.audience_unit_id AND cur_view.user_id=u_view.id))) )";
}

export async function unreadAnnouncementCount(db: D1Database, userId: string, management: boolean, now = Date.now()): Promise<number> {
  const result = await db.prepare(`SELECT COUNT(*) AS total FROM announcements a LEFT JOIN users u_view ON u_view.id=? WHERE a.status='published' AND (a.expires_at IS NULL OR a.expires_at>?) AND ${announcementAudienceWhere(management)} AND NOT EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id=a.id AND r.user_id=? AND r.read_at>=a.published_at)`).bind(userId,now,userId).first<{total:number}>();
  return Number(result?.total || 0);
}

export async function recordAnnouncementRead(db: D1Database, announcementId: string, userId: string, now = Date.now()): Promise<void> {
  await db.prepare("INSERT INTO announcement_reads(announcement_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(announcement_id,user_id) DO UPDATE SET read_at=excluded.read_at").bind(announcementId,userId,now).run();
}

export async function unansweredPollCount(db: D1Database, hashForPoll: (pollId: string) => Promise<string>, now = Date.now()): Promise<number> {
  const active = await db.prepare("SELECT p.id FROM polls p WHERE p.status='published' AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.ends_at IS NULL OR p.ends_at>?)").bind(now,now).all<{id:string}>();
  const answered = await Promise.all(active.results.map(async poll => Boolean(await db.prepare("SELECT 1 FROM poll_participations WHERE poll_id=? AND voter_hash=?").bind(poll.id,await hashForPoll(poll.id)).first())));
  return answered.filter(value=>!value).length;
}
