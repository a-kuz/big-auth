const { ...eslintConfigPrettier } = require("eslint-config-prettier");
const simpleImportSort = require("eslint-plugin-simple-import-sort");

module.exports = [

	{
		plugins: { "simple-import-sort": simpleImportSort },
		ignores: ["**/*.js"],
		rules: {
			"@stylistic/ts/member-delimiter-style": ["never", {}],

			"simple-import-sort/imports": [
				"error",
				{
					"groups": [
						// Packages `react` related packages come first.
						["^react", "^@?\\w"],
						// Internal packages.
						["^(@|components)(/.*|$)"],
						// Side effect imports.
						["^\\u0000"],
						// Parent imports. Put `..` last.
						["^\\.\\.(?!/?$)", "^\\.\\./?$"],
						// Other relative imports. Put same-folder imports and `.` last.
						["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
						// Style imports.
						["^.+\\.?(css)$"]
					]
				},],


			"sort-imports": [
				"error",
				{
					ignoreCase: false,
					ignoreDeclarationSort: false,
					ignoreMemberSort: false,
					memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
					allowSeparatedGroups: false,

				},
			],

		},
	},
	eslintConfigPrettier
];
