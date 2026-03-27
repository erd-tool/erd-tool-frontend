import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppButton, AppCard, AppInput, AppLabel, AppTextarea, StatusPill } from '../../components/ui';
import { loginRequest, signupRequest } from '../../lib/api';
import { createSampleSession } from '../../lib/dummy-data';
import { useAppStore } from '../../state/app-store';

export function AuthPage() {
  const navigate = useNavigate();
  const setSession = useAppStore((state) => state.setSession);
  const ensureSeedData = useAppStore((state) => state.ensureSeedData);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const loginId = String(form.get('loginId') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '').trim();
    const displayName = String(form.get('displayName') ?? '').trim() || loginId;

    setLoading(true);
    setError('');
    try {
      const session =
        mode === 'login'
          ? await loginRequest({ loginId, password })
          : await signupRequest({ loginId, email, password, displayName });
      if (session) {
        setSession(session);
      } else {
        setSession({
          ...createSampleSession(),
          loginId,
          email: email || `${loginId}@local.test`,
          displayName,
          token: 'local-demo-token'
        });
        ensureSeedData();
      }
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-hero">
        <div className="brand-mark">ERD</div>
        <h1>ERD 협업 작업실</h1>
        <p>
          엔티티 생성, 관계 설정, 카디널리티, 메모, 실시간 협업, SQL/PNG export까지 한 화면에서 다루는
          MVP입니다.
        </p>
        <div className="hero-badges">
          <StatusPill tone="info">React Flow</StatusPill>
          <StatusPill tone="success">Yjs</StatusPill>
          <StatusPill tone="warning">Docker</StatusPill>
        </div>
      </div>

      <AppCard className="auth-panel">
        <div className="auth-switcher">
          <AppButton variant={mode === 'login' ? 'primary' : 'secondary'} onClick={() => setMode('login')}>
            로그인
          </AppButton>
          <AppButton variant={mode === 'signup' ? 'primary' : 'secondary'} onClick={() => setMode('signup')}>
            회원가입
          </AppButton>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="field-grid">
            <div>
              <AppLabel>아이디</AppLabel>
              <AppInput name="loginId" placeholder="demo" required />
            </div>
            {mode === 'signup' && (
              <div>
                <AppLabel>이름</AppLabel>
                <AppInput name="displayName" placeholder="홍길동" required />
              </div>
            )}
          </div>

          {mode === 'signup' && (
            <div>
              <AppLabel>이메일</AppLabel>
              <AppInput name="email" type="email" placeholder="demo@example.com" required />
            </div>
          )}

          <div>
            <AppLabel>비밀번호</AppLabel>
            <AppInput name="password" type="password" placeholder="••••••••" minLength={4} required />
          </div>

          <div>
            <AppLabel>안내</AppLabel>
            <AppTextarea
              readOnly
              value="백엔드가 아직 연결되지 않은 경우에도 로컬 세션으로 진입하여 화면 동작을 확인할 수 있습니다."
            />
          </div>

          {error && <p className="error-text">{error}</p>}
          <AppButton type="submit" disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '계정 생성'}
          </AppButton>
        </form>
      </AppCard>
    </main>
  );
}
