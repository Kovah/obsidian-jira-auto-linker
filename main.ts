import {App, MarkdownPostProcessorContext, Plugin, PluginSettingTab, Setting} from 'obsidian';

interface JiraProjectRegistration {
	projectKey: string,
	baseUrl: string
}

interface JiraLinkerSettings {
	registrations: Array<JiraProjectRegistration>;
}

const DEFAULT_SETTINGS: JiraLinkerSettings = {
	registrations: [],
};

export default class JiraLinker extends Plugin {
	settings: JiraLinkerSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			this.processLinks(el);
		});
	}

	private processLinks(el: HTMLElement) {
		this.processNode(el);
	}

	private processNode(node: Node) {
		if (['A', 'CODE', 'PRE', 'IMG', 'svg', 'MJX-CONTAINER'].contains(node.nodeName)) {
			return; // do not process specific node types to not break
		}
		if (node.nodeType === Node.TEXT_NODE) {
			// directly process text nodes
			const text = node.nodeValue;
			if (text) {
				const newHtml = this.replaceWithLinks(text);
				if (newHtml !== text) {
					const span = document.createElement('span');
					span.innerHTML = newHtml;
					node.parentNode?.replaceChild(span, node);
				}
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			// if an regular element was found, process its child nodes (applies to lists, fo example)
			const element = node as HTMLElement;
			for (let i = 0; i < element.childNodes.length; i++) {
				this.processNode(element.childNodes[i]);
			}
		}
	}

	private replaceWithLinks(text: string): string {
		return this.settings.registrations.reduce((modifiedText, registration) => {
			const regex = new RegExp(`\\b(${registration.projectKey}-\\d+)\\b`, 'gi');
			return modifiedText.replace(
				regex,
				(match) => `<a href="${registration.baseUrl}/browse/${match}" target="_blank" rel="noopener noreferrer">${match}</a>`
			);
		}, text);
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

class SampleSettingTab extends PluginSettingTab {
	plugin: JiraLinker;

	constructor(app: App, plugin: JiraLinker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h1', {text: 'Jira Linker'});
		containerEl.createEl('p').innerHTML = 'by <a href="https://kovah.de" target="_blank">Kevin Woblick</a>';
		containerEl.createEl('br');

		containerEl.createEl('h2', {text: 'Projects'});
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
			.setName('Add New Registration')
			.addText((text) =>
				text.setPlaceholder('Project Key').onChange((value) => {
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
							errorEl.textContent = 'Invalid Project Key. It must be 2-10 letters or numbers, starting with a letter.';
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
						this.display(); // Refresh UI
					})
			);

		const errorEl = containerEl.createEl('div', {
			cls: 'jira-linker-error',
			text: '',
		});

		containerEl.createEl('br');
		containerEl.createEl('hr');
		containerEl.createEl('small').innerHTML = '❤️ Support my work via <a href="https://patreon.com/Kovah" target="_blank">Patreon</a>, <a href="https://github.com/Kovah" target="_blank">GitHub Sponsors</a> or <a href="https://liberapay.com/kovah" target="_blank">Liberapay</a>';
	}
}
