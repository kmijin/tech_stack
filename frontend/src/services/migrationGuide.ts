// ──────────────────────────────────────────────────────────
// 마이그레이션 패턴별 수정 가이드
// ──────────────────────────────────────────────────────────

export interface FixGuide {
  title: string
  before: string
  after: string
  note?: string
}

// 줄 단위 자동 변환 (단순 치환 가능한 경우)
export const LINE_TRANSFORMS: Record<string, (line: string) => string | null> = {
  javax_imports: line => {
    if (!line.includes('import javax.')) return null

    // Jakarta EE 9+ 에서 jakarta.* 로 이전된 패키지만 교체.
    // Java SE javax 패키지(swing, awt, crypto, net, sql, naming,
    // xml.transform/parsers/xpath/stream, security.auth 등)는 변경하지 않음.
    const JAKARTA_EE_PREFIXES = [
      'javax.persistence', 'javax.servlet', 'javax.validation',
      'javax.transaction', 'javax.annotation', 'javax.ws.rs',
      'javax.mail', 'javax.ejb', 'javax.enterprise', 'javax.inject',
      'javax.jms', 'javax.json', 'javax.websocket', 'javax.faces',
      'javax.batch', 'javax.resource', 'javax.el', 'javax.interceptor',
      'javax.decorator', 'javax.security.enterprise',
      'javax.security.auth.message', 'javax.security.jacc',
      'javax.xml.bind', 'javax.xml.soap', 'javax.xml.ws', 'javax.activation',
    ]
    for (const pkg of JAKARTA_EE_PREFIXES) {
      if (line.includes(pkg + '.') || line.includes(pkg + ';')) {
        return line.replace(pkg, pkg.replace('javax', 'jakarta'))
      }
    }
    return null
  },

  // Spring Boot 4는 Jackson 2.17+ 사용 중. tools.jackson(Jackson 3)은 미출시 — 자동 치환 불가
  // new ObjectMapper() 직접 생성만 경고 표시하고 FIX_GUIDE 참고 안내
  jackson_objectmapper: line =>
    line.includes('new ObjectMapper()')
      ? `// ⚠ 수정 필요: new ObjectMapper() 직접 생성 → @Autowired ObjectMapper 주입 권장 (FIX_GUIDE 참고)\n${line}`
      : null,

  zustand_default_import: line => {
    if (/import\s+create\s+from\s+['"]zustand['"]/.test(line))
      return line.replace(/import\s+create\s+from/, "import { create } from")
    return null
  },

  // ReactDOM.render는 인자 구조가 달라 단순 치환 불가 — 위치만 표시하고 FIX_GUIDE 참고 안내
  react_dom_render: line =>
    line.includes('ReactDOM.render(')
      ? `// ⚠ 수정 필요 (FIX_GUIDE 참고): ReactDOM.render → createRoot().render()\n${line}`
      : null,
}

// 패턴별 수정 가이드 (전체 컨텍스트)
export const FIX_GUIDES: Record<string, FixGuide> = {
  javax_imports: {
    title: 'javax.* → jakarta.* 일괄 변경',
    before: `import javax.persistence.Entity;\nimport javax.validation.constraints.NotNull;\nimport javax.servlet.http.HttpServletRequest;`,
    after:  `import jakarta.persistence.Entity;\nimport jakarta.validation.constraints.NotNull;\nimport jakarta.servlet.http.HttpServletRequest;`,
    note:   'IDE의 Find & Replace로 프로젝트 전체 일괄 치환 가능',
  },

  websecurity_adapter: {
    title: 'WebSecurityConfigurerAdapter → SecurityFilterChain Bean',
    before: `@Configuration\npublic class SecurityConfig extends WebSecurityConfigurerAdapter {\n    @Override\n    protected void configure(HttpSecurity http) throws Exception {\n        http.authorizeRequests().anyRequest().authenticated();\n    }\n}`,
    after:  `@Configuration\npublic class SecurityConfig {\n    @Bean\n    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {\n        http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated());\n        return http.build();\n    }\n}`,
    note:   'Spring Security 6부터 WebSecurityConfigurerAdapter 완전 제거',
  },

  sun_imports: {
    title: 'sun.* internal API → 표준 Java API 교체',
    before: `import sun.misc.BASE64Encoder;\n// ...\nString encoded = new BASE64Encoder().encode(bytes);`,
    after:  `import java.util.Base64;\n// ...\nString encoded = Base64.getEncoder().encodeToString(bytes);`,
    note:   '사용 중인 sun.* 클래스에 따라 대체 API가 다름. 컴파일 에러 메시지로 하나씩 확인',
  },

  deprecated_finalize: {
    title: 'finalize() → Cleaner / try-with-resources',
    before: `@Override\nprotected void finalize() throws Throwable {\n    try { cleanup(); } finally { super.finalize(); }\n}`,
    after:  `private static final Cleaner cleaner = Cleaner.create();\nprivate final Cleaner.Cleanable cleanable;\n\npublic MyClass() {\n    this.cleanable = cleaner.register(this, () -> cleanup());\n}\n\n// 또는 AutoCloseable 구현 + try-with-resources 사용`,
    note:   'Java 18부터 finalize() 지원 종료 예정. Cleaner는 java.lang.ref.Cleaner',
  },

  threadlocal_usage: {
    title: 'ThreadLocal → ScopedValue (Java 21+, Virtual Thread 환경)',
    before: `private static final ThreadLocal<User> currentUser = new ThreadLocal<>();\ncurrentUser.set(user);\nUser u = currentUser.get();\ncurrentUser.remove();`,
    after:  `private static final ScopedValue<User> CURRENT_USER = ScopedValue.newInstance();\n\n// 값 바인딩 (try-finally 불필요)\nScopedValue.where(CURRENT_USER, user).run(() -> {\n    User u = CURRENT_USER.get();\n    // ...\n});`,
    note:   'Virtual Thread 환경에서 ThreadLocal은 성능 문제 유발 가능. ScopedValue는 Java 21 정식화',
  },

  jackson_objectmapper: {
    title: 'new ObjectMapper() 직접 생성 → Spring Bean 주입 (Spring Boot 4)',
    before: `import com.fasterxml.jackson.databind.ObjectMapper;\nimport com.fasterxml.jackson.databind.SerializationFeature;\nimport com.fasterxml.jackson.databind.DeserializationFeature;\n\n// ❌ 직접 생성 — Spring Boot 4에서 권장하지 않음\nObjectMapper mapper = new ObjectMapper()\n    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)\n    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);`,
    after:  `import com.fasterxml.jackson.databind.ObjectMapper;\n\n// ✅ Spring Bean 주입 — Spring Boot가 자동 구성한 ObjectMapper 사용\n@RequiredArgsConstructor\npublic class MyService {\n    private final ObjectMapper objectMapper;\n}\n\n// 커스텀 설정이 필요한 경우 — @Bean으로 전역 재정의\n@Configuration\npublic class JacksonConfig {\n    @Bean\n    public ObjectMapper objectMapper() {\n        return JsonMapper.builder()\n            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)\n            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)\n            .build();\n    }\n}`,
    note:   'Spring Boot 4는 Jackson 2.17+ 사용 (패키지명 com.fasterxml.jackson 유지). Jackson 3(tools.jackson)은 별도 프로젝트로 아직 미출시. new ObjectMapper() 직접 생성 대신 Spring Bean 주입을 사용하면 자동 구성 혜택을 받을 수 있음.',
  },

  querydsl_config: {
    title: 'QueryDSL jakarta 분류자 추가 (build.gradle)',
    before: `implementation 'com.querydsl:querydsl-jpa:5.1.0'`,
    after:  `implementation 'com.querydsl:querydsl-jpa:5.1.0:jakarta'\n\n// JPAQueryFactory 패키지도 변경\n// import javax.persistence.EntityManager  →  import jakarta.persistence.EntityManager`,
    note:   'Spring Boot 4 (Jakarta EE 11) 환경에서는 :jakarta 분류자 필수',
  },

  react_dom_render: {
    title: 'ReactDOM.render() → createRoot().render()',
    before: `import ReactDOM from 'react-dom';\n\nReactDOM.render(\n  <App />,\n  document.getElementById('root')\n);`,
    after:  `import { createRoot } from 'react-dom/client';\n\nconst root = createRoot(document.getElementById('root')!);\nroot.render(<App />);`,
    note:   'React 18부터 ReactDOM.render() deprecated, React 19에서 완전 제거',
  },

  class_components: {
    title: 'Class 컴포넌트 → 함수형 컴포넌트',
    before: `class MyComponent extends Component<Props, State> {\n  constructor(props: Props) {\n    super(props);\n    this.state = { count: 0 };\n  }\n  render() {\n    return <div>{this.state.count}</div>;\n  }\n}`,
    after:  `function MyComponent({ ...props }: Props) {\n  const [count, setCount] = useState(0);\n  return <div>{count}</div>;\n}`,
    note:   '생명주기 메서드는 useEffect로 대체. componentDidMount → useEffect(() => {}, [])',
  },

  zustand_default_import: {
    title: 'Zustand default import → named import',
    before: `import create from 'zustand';`,
    after:  `import { create } from 'zustand';`,
    note:   'Zustand v5에서 default export 제거. createStore, useStore도 named export로 변경',
  },

  vite_plugin_usage: {
    title: 'Vite 6 Environment API — plugins 설정 확인',
    before: `// vite.config.ts (Vite 5)\nexport default defineConfig({\n  plugins: [react()],\n})`,
    after:  `// vite.config.ts (Vite 6 — SPA는 변경 없음)\nexport default defineConfig({\n  plugins: [react()],\n})\n// SSR / Edge 배포 시 environments 설정 추가 검토`,
    note:   'SPA 프로젝트는 vite.config.ts 변경 없이 Vite 6 호환. SSR·마이크로 프론트엔드만 Environment API 영향',
  },

  // ── 추가 가이드 ───────────────────────────────────────────

  spring_security_oauth2: {
    title: 'spring-security-oauth2 제거 → Spring Authorization Server',
    before: `// Spring Boot 2.x — spring-security-oauth2 (deprecated, 제거됨)\n@EnableAuthorizationServer\npublic class AuthServerConfig extends AuthorizationServerConfigurerAdapter {\n    @Override\n    public void configure(ClientDetailsServiceConfigurer clients) throws Exception {\n        clients.inMemory().withClient("client-id")...;\n    }\n}`,
    after:  `// Spring Boot 3/4 — spring-authorization-server 사용\n// build.gradle\nimplementation 'org.springframework.boot:spring-boot-starter-oauth2-authorization-server'\n\n@Configuration\n@Import(OAuth2AuthorizationServerConfiguration.class)\npublic class AuthServerConfig {\n    @Bean\n    public RegisteredClientRepository registeredClientRepository() {\n        RegisteredClient client = RegisteredClient.withId(UUID.randomUUID().toString())\n            .clientId("client-id")\n            .clientSecret("{noop}secret")\n            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)\n            .redirectUri("http://localhost:8080/login/oauth2/code/client")\n            .scope(OidcScopes.OPENID)\n            .build();\n        return new InMemoryRegisteredClientRepository(client);\n    }\n}`,
    note:   'spring-security-oauth2는 Spring Boot 3에서 완전 제거. spring-authorization-server(1.x+)로 전환 필요. API 구조가 크게 달라 단순 치환 불가 — 공식 마이그레이션 가이드 필독.',
  },

  zustand_middleware: {
    title: 'Zustand v5 middleware API 변경 (subscribeWithSelector 등)',
    before: `import create from 'zustand'\nimport { subscribeWithSelector } from 'zustand/middleware'\n\nconst useStore = create(\n  subscribeWithSelector((set) => ({\n    count: 0,\n    inc: () => set((s) => ({ count: s.count + 1 })),\n  }))\n)`,
    after:  `import { create } from 'zustand'\nimport { subscribeWithSelector } from 'zustand/middleware'\n\nconst useStore = create(\n  subscribeWithSelector((set) => ({\n    count: 0,\n    inc: () => set((s) => ({ count: s.count + 1 })),\n  }))\n)\n// v5에서 middleware 시그니처 자체는 동일하나,\n// createStore (vanilla) 사용 시 import 경로 변경 주의\nimport { createStore } from 'zustand/vanilla'`,
    note:   'Zustand v5에서 default export 제거 외에 middleware 자체 API는 대부분 유지. 단, createStore가 zustand/vanilla로 분리되었고, immer middleware 사용 시 타입 추론 방식이 변경됨. @types/immer 별도 설치 불필요(immer 자체 types 포함).',
  },

  react_proptypes: {
    title: 'PropTypes 제거 (React 19)',
    before: `import PropTypes from 'prop-types'\n\nfunction Button({ label, onClick }) {\n  return <button onClick={onClick}>{label}</button>\n}\n\nButton.propTypes = {\n  label: PropTypes.string.isRequired,\n  onClick: PropTypes.func,\n}`,
    after:  `// TypeScript Props 타입으로 대체\ninterface ButtonProps {\n  label: string\n  onClick?: () => void\n}\n\nfunction Button({ label, onClick }: ButtonProps) {\n  return <button onClick={onClick}>{label}</button>\n}\n\n// JS 프로젝트라면 JSDoc 사용\n/**\n * @param {{ label: string, onClick?: Function }} props\n */\nfunction Button({ label, onClick }) { ... }`,
    note:   'React 19에서 PropTypes 내장 지원 제거. prop-types 패키지는 별도로 유지되나 런타임 체크 불가. TypeScript 마이그레이션이 장기적으로 권장됨.',
  },

  resttemplate_to_restclient: {
    title: 'RestTemplate → RestClient (Spring Boot 3.2+)',
    before: `@Autowired\nRestTemplate restTemplate;\n\n// GET\nResponseEntity<User> res = restTemplate.getForEntity(\n    "https://api.example.com/users/{id}", User.class, userId);\nUser user = res.getBody();\n\n// POST\nHttpHeaders headers = new HttpHeaders();\nheaders.setContentType(MediaType.APPLICATION_JSON);\nHttpEntity<CreateUserRequest> req = new HttpEntity<>(body, headers);\nResponseEntity<User> created = restTemplate.postForEntity(\n    "https://api.example.com/users", req, User.class);`,
    after:  `@Autowired\nRestClient restClient;\n\n// GET\nUser user = restClient.get()\n    .uri("https://api.example.com/users/{id}", userId)\n    .retrieve()\n    .body(User.class);\n\n// POST\nUser created = restClient.post()\n    .uri("https://api.example.com/users")\n    .contentType(MediaType.APPLICATION_JSON)\n    .body(body)\n    .retrieve()\n    .body(User.class);\n\n// Bean 등록 (필요 시)\n@Bean\npublic RestClient restClient(RestClient.Builder builder) {\n    return builder.baseUrl("https://api.example.com").build();\n}`,
    note:   'RestTemplate은 Spring Framework 6.1(Boot 3.2)부터 유지보수 모드. RestClient는 동기식 HTTP 클라이언트로 RestTemplate 대체. 비동기가 필요하면 WebClient 사용. spring-boot-starter-web에 포함되어 별도 의존성 불필요.',
  },
}

// ── 마이그레이션 체크리스트 ──────────────────────────────────

export interface ChecklistItem {
  category: string
  description: string
  severity: 'high' | 'medium' | 'low'
  guideKey?: string  // FIX_GUIDES 키 — 상세 가이드 참조용
}

/** 현재→목표 버전 기반으로 수동 검토 항목 생성 */
export function getMigrationChecklist(
  from: Record<string, string>,
  to: Record<string, string>,
): ChecklistItem[] {
  const items: ChecklistItem[] = []

  // major * 100 + minor 형식으로 변환 — parseFloat("3.10") = 3.1 오류 방지
  const v = (ver: string) => {
    const [major, minor = 0] = (ver ?? '0').replace(/[^0-9.]/g, '').split('.').map(Number)
    return (major || 0) * 100 + (minor || 0)
  }
  const sbFrom = v(from.springboot ?? ''), sbTo = v(to.springboot ?? '')
  const jFrom  = v(from.java       ?? ''), jTo  = v(to.java       ?? '')
  const rFrom  = v(from.react      ?? ''), rTo  = v(to.react      ?? '')
  const vtFrom = v(from.vite       ?? ''), vtTo = v(to.vite       ?? '')

  // ── Spring Boot 2 → 3 ────────────────────────────────────
  if (sbFrom > 0 && sbFrom < 3 && sbTo >= 3) {
    items.push({
      category: 'Spring Security 6',
      description: 'antMatchers / mvcMatchers → requestMatchers 로 변경',
      severity: 'high', guideKey: 'websecurity_adapter',
    })
    items.push({
      category: 'Spring Boot 3',
      description: 'spring.factories 제거 → META-INF/spring/AutoConfiguration.imports 로 이전',
      severity: 'high',
    })
    items.push({
      category: 'Spring Boot 3',
      description: 'application.yml 변경된 프로퍼티 키 확인 (spring.redis.* → spring.data.redis.* 등)',
      severity: 'medium',
    })
    items.push({
      category: 'Spring Security',
      description: 'spring-security-oauth2 제거됨 → spring-authorization-server 전환 필요',
      severity: 'high', guideKey: 'spring_security_oauth2',
    })
  }

  // ── Spring Boot 3 → 4 ────────────────────────────────────
  if (sbFrom > 0 && sbFrom < 4 && sbTo >= 4) {
    items.push({
      category: 'Spring Boot 4',
      description: 'RestTemplate → RestClient 전환 권장 (유지보수 모드 진입)',
      severity: 'medium', guideKey: 'resttemplate_to_restclient',
    })
    items.push({
      category: 'Spring Boot 4',
      description: 'new ObjectMapper() 직접 생성 → @Bean 주입으로 변경',
      severity: 'medium', guideKey: 'jackson_objectmapper',
    })
    items.push({
      category: 'Jakarta EE 11',
      description: 'QueryDSL :jakarta 분류자 추가, 서드파티 Jakarta EE 11 호환 여부 점검',
      severity: 'medium', guideKey: 'querydsl_config',
    })
  }

  // ── Java → 17 ────────────────────────────────────────────
  if (jFrom > 0 && jFrom < 17 && jTo >= 17) {
    items.push({
      category: 'Java 17',
      description: 'sun.* internal API 사용 코드 컴파일 오류 — 표준 API 교체 필요',
      severity: 'high', guideKey: 'sun_imports',
    })
    items.push({
      category: 'Java 17',
      description: '--illegal-access JVM 옵션 완전 제거 — JVM 실행 스크립트에서 삭제',
      severity: 'medium',
    })
  }

  // ── Java → 21 ────────────────────────────────────────────
  if (jFrom > 0 && jFrom < 21 && jTo >= 21) {
    items.push({
      category: 'Java 21',
      description: 'finalize() 지원 종료 예정 — Cleaner / AutoCloseable 교체',
      severity: 'high', guideKey: 'deprecated_finalize',
    })
    items.push({
      category: 'Java 21',
      description: 'Virtual Thread 도입 시 ThreadLocal → ScopedValue 전환 검토',
      severity: 'medium', guideKey: 'threadlocal_usage',
    })
  }

  // ── React → 18 ───────────────────────────────────────────
  if (rFrom > 0 && rFrom < 18 && rTo >= 18) {
    items.push({
      category: 'React 18',
      description: 'ReactDOM.render → createRoot().render() 교체 필수 (React 19 완전 제거)',
      severity: 'high', guideKey: 'react_dom_render',
    })
    items.push({
      category: 'React 18',
      description: 'StrictMode: useEffect 2회 실행 — cleanup 함수 누락 여부 확인',
      severity: 'medium',
    })
  }

  // ── React → 19 ───────────────────────────────────────────
  if (rFrom > 0 && rFrom < 19 && rTo >= 19) {
    items.push({
      category: 'React 19',
      description: 'propTypes / 함수 컴포넌트 defaultProps 제거 → TypeScript Props 타입으로 교체',
      severity: 'high', guideKey: 'react_proptypes',
    })
    items.push({
      category: 'React 19',
      description: 'string ref · legacy Context API 완전 제거 확인',
      severity: 'high',
    })
  }

  // ── Vite → 6 ─────────────────────────────────────────────
  if (vtFrom > 0 && vtFrom < 6 && vtTo >= 6) {
    items.push({
      category: 'Vite 6',
      description: 'SSR / 마이크로 프론트엔드 사용 시 Environment API 마이그레이션 확인',
      severity: 'medium', guideKey: 'vite_plugin_usage',
    })
  }

  return items
}
