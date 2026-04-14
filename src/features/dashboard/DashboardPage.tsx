import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppButton, AppCard, AppInput, AppLabel, StatusPill } from '../../components/ui';
import {
  acceptTeamInvitation,
  createErd,
  createTeam,
  deleteErdRequest,
  deleteTeamRequest,
  fetchErds,
  fetchTeamInvitations,
  fetchTeams,
  inviteTeamMember,
  rejectTeamInvitation
} from '../../lib/api';
import { nowIso, formatDate } from '../../lib/storage';
import { getSeasonTheme } from '../../lib/theme';
import type { ErdSummary, TeamInvitationSummary } from '../../lib/types';
import { useAppStore } from '../../state/app-store';

const LOCAL_DEMO_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
const EMPTY_STATE_STYLE = {
  padding: '16px',
  borderRadius: '18px',
  border: '1px dashed var(--border)',
  background: 'var(--surface-soft)'
} as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const session = useAppStore((state) => state.session);
  const teams = useAppStore((state) => state.teams);
  const erds = useAppStore((state) => state.erds);
  const token = session?.token;
  const setTeams = useAppStore((state) => state.setTeams);
  const setErds = useAppStore((state) => state.setErds);
  const logout = useAppStore((state) => state.logout);
  const createTeamLocal = useAppStore((state) => state.createTeamLocal);
  const createErdLocal = useAppStore((state) => state.createErdLocal);
  const deleteTeamLocal = useAppStore((state) => state.deleteTeamLocal);
  const deleteErdLocal = useAppStore((state) => state.deleteErdLocal);
  const [teamName, setTeamName] = useState('');
  const [personalErdTitle, setPersonalErdTitle] = useState('');
  const [teamErdTitle, setTeamErdTitle] = useState('');
  const [inviteLoginId, setInviteLoginId] = useState('');
  const [inviteResult, setInviteResult] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitationSummary[]>([]);
  const [actionError, setActionError] = useState('');
  const [createTeamTargetId, setCreateTeamTargetId] = useState('');
  const [inviteTargetTeamId, setInviteTargetTeamId] = useState('');
  const theme = getSeasonTheme();
  const ownerTeams = teams.filter((team) => team.role === 'OWNER');

  useEffect(() => {
    if (!token || token === 'local-demo-token') return;
    let cancelled = false;

    void Promise.all([fetchTeams(token), fetchErds(token), fetchTeamInvitations(token)])
      .then(([remoteTeams, remoteErds, remoteInvitations]) => {
        if (cancelled) return;
        if (remoteTeams) setTeams(remoteTeams);
        if (remoteErds) setErds(remoteErds);
        setPendingInvitations((remoteInvitations ?? []).filter((invitation) => invitation.status === 'PENDING'));
      })
      .catch(() => {
        if (!cancelled) {
          setActionError('대시보드 데이터를 불러오지 못했습니다. 잠시 후 다시 새로고침해 주세요.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setErds, setTeams, token]);

  useEffect(() => {
    setCreateTeamTargetId((current) => (teams.some((team) => team.id === current) ? current : teams[0]?.id ?? ''));
    setInviteTargetTeamId((current) => (ownerTeams.some((team) => team.id === current) ? current : ownerTeams[0]?.id ?? ''));
  }, [ownerTeams, teams]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = teamName.trim() || '새 팀';
    setActionError('');

    if (token === 'local-demo-token' && LOCAL_DEMO_ENABLED) {
      createTeamLocal(name);
      setTeamName('');
      return;
    }

    try {
      const remote = await createTeam(token, name);
      setTeams([remote, ...teams.filter((team) => team.id !== remote.id)]);
      setTeamName('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '팀 생성에 실패했습니다.');
    }
  }

  async function handleCreatePersonalErd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = personalErdTitle.trim() || '새 개인 ERD';
    setActionError('');

    if (token === 'local-demo-token' && LOCAL_DEMO_ENABLED) {
      const local = createErdLocal(title, null);
      setPersonalErdTitle('');
      navigate(`/app/erd/${local.id}`);
      return;
    }

    try {
      const remote = await createErd(token, title);
      setErds([remote, ...erds.filter((erd) => erd.id !== remote.id)]);
      setPersonalErdTitle('');
      navigate(`/app/erd/${remote.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '개인 ERD 생성에 실패했습니다.');
    }
  }

  async function handleCreateTeamErd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createTeamTargetId) return;
    const title = teamErdTitle.trim() || '새 팀 ERD';
    setActionError('');

    if (token === 'local-demo-token' && LOCAL_DEMO_ENABLED) {
      const local = createErdLocal(title, createTeamTargetId);
      setTeamErdTitle('');
      navigate(`/app/erd/${local.id}`);
      return;
    }

    try {
      const remote = await createErd(token, title, createTeamTargetId);
      setErds([remote, ...erds.filter((erd) => erd.id !== remote.id)]);
      setTeamErdTitle('');
      navigate(`/app/erd/${remote.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '팀 ERD 생성에 실패했습니다.');
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteTargetTeamId || !inviteLoginId.trim()) return;
    setActionError('');
    setInviteResult('');

    if (token === 'local-demo-token' && LOCAL_DEMO_ENABLED) {
      setInviteResult('로컬 데모 모드에서는 초대 기능이 제한됩니다.');
      setInviteLoginId('');
      return;
    }

    try {
      const invitation = await inviteTeamMember(token, inviteTargetTeamId, inviteLoginId.trim());
      setInviteResult(`${invitation.inviteeDisplayName} (${invitation.inviteeLoginId}) 계정을 ${invitation.teamName} 팀에 초대했습니다.`);
      setTeams(
        teams.map((team) =>
          team.id === invitation.teamId
            ? { ...team, invitationCount: team.invitationCount + 1 }
            : team
        )
      );
      setInviteLoginId('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '팀 초대에 실패했습니다.');
    }
  }

  async function handleAcceptInvitation(invitation: TeamInvitationSummary) {
    setActionError('');
    try {
      const acceptedTeam = await acceptTeamInvitation(token, invitation.id);
      setTeams([acceptedTeam, ...teams.filter((team) => team.id !== acceptedTeam.id)]);
      setPendingInvitations(pendingInvitations.filter((item) => item.id !== invitation.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '초대 수락에 실패했습니다.');
    }
  }

  async function handleRejectInvitation(invitation: TeamInvitationSummary) {
    setActionError('');
    try {
      await rejectTeamInvitation(token, invitation.id);
      setPendingInvitations(pendingInvitations.filter((item) => item.id !== invitation.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '초대 거절에 실패했습니다.');
    }
  }

  async function handleDeleteErd(erdId: string, title: string) {
    if (!window.confirm(`'${title}' ERD를 삭제하시겠습니까?`)) return;
    setActionError('');

    if (token === 'local-demo-token' && LOCAL_DEMO_ENABLED) {
      deleteErdLocal(erdId);
      return;
    }

    try {
      await deleteErdRequest(token, erdId);
      setErds(erds.filter((erd) => erd.id !== erdId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'ERD 삭제에 실패했습니다.');
    }
  }

  async function handleDeleteTeam(teamId: string, teamNameValue: string) {
    if (!window.confirm(`'${teamNameValue}' 팀과 팀 소속 ERD를 삭제하시겠습니까?`)) return;
    setActionError('');

    if (token === 'local-demo-token' && LOCAL_DEMO_ENABLED) {
      deleteTeamLocal(teamId);
      return;
    }

    try {
      await deleteTeamRequest(token, teamId);
      setTeams(teams.filter((team) => team.id !== teamId));
      setErds(erds.filter((erd) => erd.teamId !== teamId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '팀 삭제에 실패했습니다.');
    }
  }

  const personalErds = erds.filter((erd) => !erd.teamId);
  const teamErds = erds.filter((erd) => Boolean(erd.teamId));
  const totalCollaborators = erds.reduce((sum, item) => sum + item.collaboratorCount, 0);
  const collaborationLabel = teams.length > 0 ? `${teams.length}개 팀 연결` : '개인 작업 모드';
  const pendingInvitationCount = pendingInvitations.length;

  const renderErdList = (items: ErdSummary[], emptyTitle: string, emptyDescription: string) => {
    if (items.length === 0) {
      return (
        <div style={EMPTY_STATE_STYLE}>
          <strong>{emptyTitle}</strong>
          <p className="helper-text">{emptyDescription}</p>
        </div>
      );
    }

    return (
      <div className="list">
        {items.map((erd) => (
          <div key={erd.id} className="list-item plain">
            <button className="list-item-link" onClick={() => navigate(`/app/erd/${erd.id}`)}>
              <div>
                <strong>{erd.title}</strong>
                <span>{erd.teamName ?? erd.ownerName}</span>
              </div>
              <div className="list-meta">
                <StatusPill tone={erd.teamId ? 'info' : 'neutral'}>{erd.teamId ? '팀 ERD' : '개인 ERD'}</StatusPill>
                <small>{formatDate(erd.updatedAt)}</small>
              </div>
            </button>
            <div className="list-actions">
              <AppButton variant="danger" className="list-action-button" onClick={() => handleDeleteErd(erd.id, erd.title)}>
                삭제
              </AppButton>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page-stack">
      <AppCard className="dashboard-header-card">
        <div className="dashboard-header-top">
          <div className="dashboard-header-copy">
            <div className="hero-badges">
              <StatusPill tone="success">협업 준비 완료</StatusPill>
              <StatusPill tone={teams.length > 0 ? 'info' : 'neutral'}>{collaborationLabel}</StatusPill>
              {pendingInvitationCount > 0 && <StatusPill tone="warning">받은 초대 {pendingInvitationCount}건</StatusPill>}
              <StatusPill tone="warning">{theme.label}</StatusPill>
            </div>
            <div>
              <h2>안녕하세요, {session?.displayName ?? '사용자'}님</h2>
              <p>좌측에서는 개인 초안을 빠르게 만들고, 우측에서는 팀 문서와 초대 흐름을 바로 이어서 관리합니다.</p>
            </div>
            {actionError && <p className="error-text">{actionError}</p>}
          </div>

          <div className="dashboard-header-actions">
            <AppButton variant="secondary" onClick={() => navigate('/login')}>
              계정 전환
            </AppButton>
            <AppButton variant="ghost" onClick={handleLogout}>
              로그아웃
            </AppButton>
          </div>
        </div>

        <div className="dashboard-header-status">
          <div>
            <span>개인 ERD</span>
            <strong>{personalErds.length}개</strong>
          </div>
          <div>
            <span>팀 ERD</span>
            <strong>{teamErds.length}개</strong>
          </div>
          <div>
            <span>연결 팀</span>
            <strong>{teams.length}개</strong>
          </div>
          <div>
            <span>받은 초대</span>
            <strong>{pendingInvitationCount}건</strong>
          </div>
          <div>
            <span>접속자 합계</span>
            <strong>{totalCollaborators}명</strong>
          </div>
          <div>
            <span>기준 시각</span>
            <strong>{formatDate(nowIso())}</strong>
          </div>
        </div>
      </AppCard>

      <div className="dashboard-board">
        <section className="dashboard-column">
          <AppCard className="dashboard-card">
            <div className="section-head compact">
              <div>
                <h3>개인 ERD</h3>
                <p>아이디어 초안과 실험용 모델을 먼저 가볍게 정리합니다.</p>
              </div>
            </div>

            <form className="dashboard-create-stack" onSubmit={handleCreatePersonalErd}>
              <div>
                <AppLabel htmlFor="personal-erd-title">개인용 제목</AppLabel>
                <AppInput
                  id="personal-erd-title"
                  name="erdTitle"
                  placeholder="예: 주문 시스템 개인안"
                  value={personalErdTitle}
                  onChange={(event) => setPersonalErdTitle(event.target.value)}
                />
              </div>
              <p className="helper-text">팀 문서로 확장하기 전에 개인 초안을 빠르게 열어 두기 좋습니다.</p>
              <AppButton type="submit">
                개인 ERD 생성
              </AppButton>
            </form>
          </AppCard>

          <AppCard className="dashboard-card">
            <div className="section-head compact">
              <div>
                <h3>개인 ERD 목록</h3>
                <p>혼자 작업 중인 문서만 별도로 모아 빠르게 확인합니다.</p>
              </div>
            </div>
            {renderErdList(personalErds, '아직 개인 ERD가 없습니다.', '개인 ERD 생성 버튼으로 첫 초안을 시작해 보세요.')}
          </AppCard>
        </section>

        <section className="dashboard-column">
          <AppCard className="dashboard-card">
            <div className="section-head compact">
              <div>
                <h3>팀 작업</h3>
                <p>팀 생성, 팀 선택, 협업 ERD 생성, 멤버 초대를 한 흐름으로 묶었습니다.</p>
              </div>
            </div>

            <div className="dashboard-team-stack">
              <form className="dashboard-create-stack" onSubmit={handleCreateTeam}>
                <div>
                  <AppLabel htmlFor="team-name-create">새 팀 이름</AppLabel>
                  <AppInput
                    id="team-name-create"
                    name="teamName"
                    placeholder="예: 3조 협업팀"
                    value={teamName}
                    onChange={(event) => setTeamName(event.target.value)}
                  />
                </div>
                <AppButton type="submit">팀 생성</AppButton>
              </form>

              <div className="dashboard-choice-panel">
                <div className="section-head compact">
                  <div>
                    <h3>연결된 팀</h3>
                    <p>드롭다운 대신 버튼으로 바로 팀을 선택합니다.</p>
                  </div>
                </div>
                {teams.length > 0 ? (
                  <div className="team-choice-grid">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        className={`team-choice-button ${createTeamTargetId === team.id ? 'active' : ''}`}
                        onClick={() => {
                          setCreateTeamTargetId(team.id);
                          if (team.role === 'OWNER') {
                            setInviteTargetTeamId(team.id);
                          }
                        }}
                      >
                        <strong>{team.name}</strong>
                        <span>{team.role ? `${team.role} 권한` : `${team.memberCount}명 참여`}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="helper-text">먼저 팀을 생성하면 팀 ERD와 초대 흐름이 활성화됩니다.</p>
                )}
              </div>

              <form className="dashboard-create-stack" onSubmit={handleCreateTeamErd}>
                <div>
                  <AppLabel htmlFor="team-erd-title">팀용 제목</AppLabel>
                  <AppInput
                    id="team-erd-title"
                    name="teamErdTitle"
                    placeholder="예: 주문 시스템 협업안"
                    value={teamErdTitle}
                    onChange={(event) => setTeamErdTitle(event.target.value)}
                    disabled={teams.length === 0}
                  />
                </div>
                <p className="helper-text">
                  선택된 팀: <strong>{teams.find((team) => team.id === createTeamTargetId)?.name ?? '없음'}</strong>
                </p>
                <AppButton type="submit" disabled={teams.length === 0}>
                  팀 ERD 생성
                </AppButton>
              </form>

              <form className="dashboard-create-stack" onSubmit={handleInvite}>
                <div>
                  <AppLabel htmlFor="invite-login-id">초대할 아이디</AppLabel>
                  <AppInput
                    id="invite-login-id"
                    name="inviteLoginId"
                    placeholder="예: test1"
                    value={inviteLoginId}
                    onChange={(event) => setInviteLoginId(event.target.value)}
                    required
                    disabled={ownerTeams.length === 0}
                  />
                </div>
                <p className="helper-text">
                  초대 대상 팀: <strong>{ownerTeams.find((team) => team.id === inviteTargetTeamId)?.name ?? '없음'}</strong>
                </p>
                {ownerTeams.length === 0 ? (
                  <p className="helper-text">팀원 초대는 OWNER 권한이 있는 팀에서만 가능합니다.</p>
                ) : null}
                <AppButton type="submit" variant="secondary" disabled={ownerTeams.length === 0}>
                  팀원 초대
                </AppButton>
                {inviteResult && <p className="helper-text">{inviteResult}</p>}
              </form>
            </div>
          </AppCard>

          <AppCard className="dashboard-card">
            <div className="section-head compact">
              <div>
                <h3>받은 초대</h3>
                <p>내 아이디로 도착한 팀 초대를 확인하고 바로 수락하거나 거절합니다.</p>
              </div>
            </div>
            {pendingInvitations.length > 0 ? (
              <div className="list">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className="list-item plain">
                    <div>
                      <strong>{invitation.teamName}</strong>
                      <span>
                        {invitation.inviteeDisplayName} ({invitation.inviteeLoginId}) · 만료 {formatDate(invitation.expiresAt)}
                      </span>
                    </div>
                    <div className="list-actions">
                      <AppButton className="list-action-button" onClick={() => handleAcceptInvitation(invitation)}>
                        수락
                      </AppButton>
                      <AppButton
                        variant="secondary"
                        className="list-action-button"
                        onClick={() => handleRejectInvitation(invitation)}
                      >
                        거절
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={EMPTY_STATE_STYLE}>
                <strong>받은 초대가 없습니다.</strong>
                <p className="helper-text">다른 팀에서 아이디로 초대하면 이 영역에 바로 나타납니다.</p>
              </div>
            )}
          </AppCard>

          <AppCard className="dashboard-card">
            <div className="section-head compact">
              <div>
                <h3>팀 ERD 목록</h3>
                <p>협업 중인 문서만 모아서 팀 단위 작업 흐름을 정리합니다.</p>
              </div>
            </div>
            {renderErdList(teamErds, '아직 팀 ERD가 없습니다.', '팀을 선택한 뒤 팀 ERD 생성 버튼으로 첫 협업 문서를 만들어 보세요.')}
          </AppCard>

          <AppCard className="dashboard-card">
            <div className="section-head compact">
              <div>
                <h3>팀 관리</h3>
                <p>현재 연결된 팀과 권한 상태를 확인하고 필요 시 정리합니다.</p>
              </div>
            </div>
            <div className="list">
              {teams.length > 0 ? (
                teams.map((team) => (
                  <div key={team.id} className="list-item plain">
                    <div>
                      <strong>{team.name}</strong>
                      <span>{team.role ? `${team.role} 권한` : `${team.memberCount}명 참여`}</span>
                    </div>
                    <div className="list-actions">
                      <div className="list-meta">
                        <StatusPill tone="success">{team.invitationCount} invite</StatusPill>
                        <small>{formatDate(team.updatedAt)}</small>
                      </div>
                      {team.role === 'OWNER' && (
                        <AppButton
                          variant="danger"
                          className="list-action-button"
                          onClick={() => handleDeleteTeam(team.id, team.name)}
                        >
                          삭제
                        </AppButton>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={EMPTY_STATE_STYLE}>
                  <strong>생성된 팀이 없습니다.</strong>
                  <p className="helper-text">새 팀을 만든 뒤 팀 ERD와 초대 흐름을 이어가 보세요.</p>
                </div>
              )}
            </div>
          </AppCard>
        </section>
      </div>
    </div>
  );
}
