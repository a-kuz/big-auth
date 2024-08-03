const { ...eslintConfigPrettier } = require('eslint-config-prettier')
const simpleImportSort = require('eslint-plugin-simple-import-sort')

module.exports = [
	{
		plugins: { 'simple-import-sort': simpleImportSort },
		ignores: ['**/*.js'],
		rules: {
			'simple-import-sort/imports': [
				'error',
				{
					groups: [
						// Packages `react` related packages come first.
						['^react', '^@?\\w'],
						// Internal packages.
						['^(@|components)(/.*|$)'],
						// Side effect imports.
						['^\\u0000'],
						// Parent imports. Put `..` last.
						['^\\.\\.(?!/?$)', '^\\.\\./?$'],
						// Other relative imports. Put same-folder imports and `.` last.
						['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
						// Style imports.
						['^.+\\.?(css)$'],
					],
				},
			],

			'@stylistic/ts/lines-between-class-members': [
				'error',
				'always',
				{ exceptAfterSingleLine: true },
			],
		},
	},
	eslintConfigPrettier,
]
