import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppButton, AppCard, AppInput, AppLabel, StatusPill } from '../../components/ui';
import { createTeam, createErd, fetchErds, fetchTeams, inviteTeamMember } from '../../lib/api';
import { formatDate, nowIso } from '../../lib/storage';
import { useAppStore } from '../../state/app-store';

export function DashboardPage() {
  const navigate = useNavigate();
  const session = useAppStore((state) => state.session);
  const teams = useAppStore((state) => state.teams);
  const erds = useAppStore((state) => state.erds);
  const token = session?.token;
  const setTeams = useAppStore((state) => state.setTeams);
  const setErds = useAppStore((state) => state.setErds);
  const createTeamLocal = useAppStore((state) => state.createTeamLocal);
  const createErdLocal = useAppStore((state) => state.createErdLocal);
  const [inviteToken, setInviteToken] = useState('');

  useEffect(() => {
    if (!token || token === 'local-demo-token') return;
    let cancelled = false;
    void Promise.all([fetchTeams(token), fetchErds(token)]).then(([remoteTeams, remoteErds]) => {
      if (cancelled) return;
      if (remoteTeams) setTeams(remoteTeams);
      if (remoteErds) setErds(remoteErds);
    });
    return () => {
      cancelled = true;
    };
  }, [setErds, setTeams, token]);

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('teamName') ?? '새 팀').trim();
    const remote = await createTeam(token, name);
    if (remote) {
      setTeams([remote, ...teams.filter((team) => team.id !== remote.id)]);
      formEl.reset();
      return;
    }
    createTeamLocal(name);
    formEl.reset();
  }

  async function handleCreateErd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const title = String(form.get('erdTitle') ?? '새 ERD').trim();
    const teamId = String(form.get('teamId') ?? '').trim() || undefined;
    const remote = await createErd(token, title, teamId);
    if (remote) {
      setErds([remote, ...erds.filter((erd) => erd.id !== remote.id)]);
      formEl.reset();
      navigate(`/app/erd/${remote.id}`);
      return;
    }
    const local = createErdLocal(title, teamId ?? null);
    formEl.reset();
    navigate(`/app/erd/${local.id}`);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const teamId = String(form.get('inviteTeamId') ?? '').trim();
    const email = String(form.get('inviteEmail') ?? '').trim();
    if (!teamId || !email) return;
    const invitation = await inviteTeamMember(token, teamId, email);
    setInviteToken(invitation?.token ?? '로컬 데모 모드에서는 초대 토큰이 생성되지 않습니다.');
    formEl.reset();
  }

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div>
          <StatusPill tone="success">협업 준비 완료</StatusPill>
          <h2>안녕하세요, {session?.displayName ?? '사용자'}님</h2>
          <p>개인 ERD와 팀 ERD를 한곳에서 관리하고, 바로 편집으로 이동할 수 있습니다.</p>
        </div>
        <div className="hero-metrics">
          <AppCard className="metric-card">
            <strong>{erds.length}</strong>
            <span>ERD</span>
          </AppCard>
          <AppCard className="metric-card">
            <strong>{teams.length}</strong>
            <span>팀</span>
          </AppCard>
          <AppCard className="metric-card">
            <strong>{erds.reduce((sum, item) => sum + item.collaboratorCount, 0)}</strong>
            <span>접속자</span>
          </AppCard>
        </div>
      </section>

      <div className="dashboard-grid">
        <AppCard>
          <div className="section-head">
            <div>
              <h3>빠른 생성</h3>
              <p>팀과 ERD를 바로 만들 수 있습니다.</p>
            </div>
          </div>
          <form className="stack" onSubmit={handleCreateTeam}>
            <div>
              <AppLabel>팀 이름</AppLabel>
              <AppInput name="teamName" placeholder="예: 3조 협업팀" />
            </div>
            <AppButton type="submit">팀 생성</AppButton>
          </form>

          <form className="stack spaced" onSubmit={handleCreateErd}>
            <div>
              <AppLabel>ERD 이름</AppLabel>
              <AppInput name="erdTitle" placeholder="예: 주문 시스템" />
            </div>
            <div>
              <AppLabel>팀 연결</AppLabel>
              <select name="teamId" className="app-input">
                <option value="">개인 ERD</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <AppButton type="submit">ERD 생성</AppButton>
          </form>
        </AppCard>

        <AppCard>
          <div className="section-head">
            <div>
              <h3>최근 ERD</h3>
              <p>즉시 편집 가능한 문서 목록입니다.</p>
            </div>
          </div>
          <div className="list">
            {erds.map((erd) => (
              <button key={erd.id} className="list-item" onClick={() => navigate(`/app/erd/${erd.id}`)}>
                <div>
                  <strong>{erd.title}</strong>
                  <span>{erd.teamName ?? erd.ownerName}</span>
                </div>
                <div className="list-meta">
                  <StatusPill tone={erd.teamId ? 'info' : 'neutral'}>{erd.teamId ? '팀' : '개인'}</StatusPill>
                  <small>{formatDate(erd.updatedAt)}</small>
                </div>
              </button>
            ))}
          </div>
        </AppCard>

        <AppCard>
          <div className="section-head">
            <div>
              <h3>팀</h3>
              <p>팀 초대와 공동 편집의 기본 단위입니다.</p>
            </div>
          </div>
          <div className="list">
            {teams.map((team) => (
              <div key={team.id} className="list-item plain">
                <div>
                  <strong>{team.name}</strong>
                  <span>{team.role ? `${team.role} 권한` : `${team.memberCount}명 참여`}</span>
                </div>
                <div className="list-meta">
                  <StatusPill tone="success">{team.invitationCount} invite</StatusPill>
                  <small>{formatDate(team.updatedAt)}</small>
                </div>
              </div>
            ))}
          </div>
          <form className="stack spaced" onSubmit={handleInvite}>
            <div>
              <AppLabel>초대할 팀</AppLabel>
              <select name="inviteTeamId" className="app-input" required>
                <option value="">팀 선택</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <AppLabel>이메일</AppLabel>
              <AppInput name="inviteEmail" type="email" placeholder="member@example.com" required />
            </div>
            <AppButton type="submit" variant="secondary">
              팀원 초대
            </AppButton>
            {inviteToken && <p className="helper-text">초대 토큰: {inviteToken}</p>}
          </form>
        </AppCard>

        <AppCard>
          <div className="section-head">
            <div>
              <h3>상태</h3>
              <p>자동 저장과 협업 연결 상태를 확인합니다.</p>
            </div>
          </div>
          <div className="status-grid">
            <div>
              <span>서버 시간</span>
              <strong>{formatDate(nowIso())}</strong>
            </div>
            <div>
              <span>자동 저장</span>
              <strong>활성</strong>
            </div>
            <div>
              <span>협업</span>
              <strong>Yjs hook ready</strong>
            </div>
          </div>
        </AppCard>
      </div>
    </div>
  );
}
