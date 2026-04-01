import nextPlugin from 'eslint-config-next'

const eslintConfig = [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'modules/**'],
  },
  ...nextPlugin,
]

export default eslintConfig
