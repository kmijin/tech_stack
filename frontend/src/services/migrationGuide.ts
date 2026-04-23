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
  javax_imports: line =>
    line.includes('import javax.')
      ? line.replace(/import javax\./g, 'import jakarta.')
      : null,

  jackson_objectmapper: line =>
    line.includes('com.fasterxml.jackson')
      ? line.replace(/com\.fasterxml\.jackson/g, 'tools.jackson')
      : null,

  zustand_default_import: line => {
    if (/import\s+create\s+from\s+['"]zustand['"]/.test(line))
      return line.replace(/import\s+create\s+from/, "import { create } from")
    return null
  },

  react_dom_render: line =>
    line.includes('ReactDOM.render(')
      ? line.replace('ReactDOM.render(', '/* 수정 필요 */ createRoot(rootElement).render(')
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
    title: 'Jackson 2 → Jackson 3 패키지 변경 (Spring Boot 4)',
    before: `import com.fasterxml.jackson.databind.ObjectMapper;\nimport com.fasterxml.jackson.databind.SerializationFeature;\nimport com.fasterxml.jackson.databind.DeserializationFeature;\n\nnew ObjectMapper()\n    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)\n    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);`,
    after:  `import tools.jackson.databind.ObjectMapper;\nimport tools.jackson.databind.SerializationFeature;\nimport tools.jackson.databind.DeserializationFeature;\n\n// 또는 Spring Bean으로 주입받아 사용 (권장)\n@RequiredArgsConstructor\npublic class MyService {\n    private final ObjectMapper objectMapper; // Spring이 Jackson 3 기준으로 자동 구성\n}`,
    note:   'Jackson 3은 패키지가 com.fasterxml.jackson → tools.jackson으로 변경. 직접 new ObjectMapper() 대신 Spring Bean 주입 권장',
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
}
