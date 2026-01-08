import {App, Plugin, PluginSettingTab, Setting} from 'obsidian';

interface JiraProjectRegistration {
	projectKey: string,
	baseUrl: string
}

interface JiraLinkMatch {
	start: number;
	end: number;
	matchedText: string;
	registration: JiraProjectRegistration;
}

interface JiraAutoLinkerSettings {
	registrations: Array<JiraProjectRegistration>;
}

const DEFAULT_SETTINGS: JiraAutoLinkerSettings = {
	registrations: [],
};

export default class JiraAutoLinker extends Plugin {
	settings: JiraAutoLinkerSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new JiraAutoLinkerSettingsTab(this.app, this));

		this.registerMarkdownPostProcessor((el: HTMLElement) => {
			this.processNode(el);
		});
	}

	private processNode(node: Node) {
		if (['A', 'CODE', 'PRE', 'IMG', 'svg', 'MJX-CONTAINER'].contains(node.nodeName)) {
			return;
		}

		if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
			const text = node.nodeValue;
			const matches = this.processLinks(text);

			if (matches.length) {
				this.replaceWithLinks(node, text, matches);
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node as HTMLElement;
			for (let i = element.childNodes.length - 1; i >= 0; i--) {
				this.processNode(element.childNodes[i]);
			}
		}
	}

	private processLinks(text: string): Array<JiraLinkMatch> {
		const matches: Array<JiraLinkMatch> = [];

		for (const registration of this.settings.registrations) {
			const escapedKey = registration.projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`\\b(${escapedKey}-\\d+)\\b`, 'gi');
			let match: RegExpExecArray | null;

			while ((match = regex.exec(text)) !== null) {
				matches.push({
					start: match.index,
					end: regex.lastIndex,
					matchedText: match[0],
					registration
				});
			}
		}

		matches.sort((a, b) => a.start - b.start);

		const filtered: Array<JiraLinkMatch> = [];
		let lastEnd = 0;

		for (const match of matches) {
			if (match.start < lastEnd) {
				continue;
			}
			filtered.push(match);
			lastEnd = match.end;
		}

		return filtered;
	}

	private replaceWithLinks(node: Node, text: string, matches: Array<JiraLinkMatch>) {
		const fragment = document.createDocumentFragment();
		let cursor = 0;

		for (const match of matches) {
			if (match.start > cursor) {
				fragment.appendChild(document.createTextNode(text.substring(cursor, match.start)));
			}

			const anchor = document.createElement('a');
			anchor.textContent = match.matchedText;
			anchor.href = `${match.registration.baseUrl}/browse/${match.matchedText}`;
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
			fragment.appendChild(anchor);
			cursor = match.end;
		}

		if (cursor < text.length) {
			fragment.appendChild(document.createTextNode(text.substring(cursor)));
		}

		node.parentNode?.replaceChild(fragment, node);
	}

	onunload() {
		// nothing to do here
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class JiraAutoLinkerSettingsTab extends PluginSettingTab {
	plugin: JiraAutoLinker;

	constructor(app: App, plugin: JiraAutoLinker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl).setName('Projects').setHeading();
		containerEl.createEl('p', {text: 'Configure your projects here. The project key is the actual key from Jira and consists of uppercase letters or numbers without the dash and the issue number. The Jira URL must be set without a path, like https://example.atlassian.net.'});

		// Display current registrations
		this.plugin.settings.registrations.forEach((registration, index) => {
			new Setting(containerEl)
				.setName(`Project: ${registration.projectKey}`)
				.setDesc(`Base URL: ${registration.baseUrl}`)
				.addExtraButton((btn) =>
					btn
						.setIcon('trash')
						.setTooltip('Delete')
						.onClick(async () => {
							this.plugin.settings.registrations.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		});

		// Add a new registration
		let newProjectKey: string = '';
		let newBaseUrl: string = '';

		// Add a new registration
		new Setting(containerEl)
			.setName('Add new registration')
			.addText((text) =>
				text.setPlaceholder('Project key').onChange((value) => {
					newProjectKey = value;
				})
			)
			.addText((text) =>
				text.setPlaceholder('Jira URL').onChange((value) => {
					newBaseUrl = value;
				})
			)
			.addButton((btn) =>
				btn
					.setButtonText('Add')
					.setCta()
					.onClick(async () => {
						// Validation logic
						const projectKeyValid = /^[a-zA-Z][a-zA-Z0-9]{1,9}$/.test(newProjectKey);
						const baseUrlValid = /^https:\/\/[a-zA-Z0-9.-]+\.atlassian\.net$/.test(newBaseUrl);

						if (!projectKeyValid) {
							errorEl.textContent = 'Invalid project key. It must be 2-10 letters or numbers, starting with a letter.';
							errorEl.classList.remove('hidden');
							return;
						}
						if (!baseUrlValid) {
							errorEl.textContent = 'Invalid Jira URL. It must be the base URL of your Jira instance without a path (e.g., https://example.atlassian.net).';
							errorEl.classList.remove('hidden');
							return;
						}
						errorEl.classList.add('hidden');

						// Add the new registration
						this.plugin.settings.registrations.push({
							projectKey: newProjectKey,
							baseUrl: newBaseUrl,
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		const errorEl = new Setting(containerEl).setClass('jira-linker-error').controlEl;

		containerEl.createEl('br');
		containerEl.createEl('hr');
		containerEl.createEl('small').innerHTML = '❤️ Support my work via <a href="https://patreon.com/Kovah" target="_blank">Patreon</a>, <a href="https://github.com/Kovah" target="_blank">GitHub Sponsors</a> or <a href="https://liberapay.com/kovah" target="_blank">Liberapay</a>';
	}
}
