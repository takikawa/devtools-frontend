// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../core/i18n/i18n.js';
import type * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import type * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as UI from '../../ui/legacy/legacy.js';

import breakpointEditDialogStyles from './breakpointEditDialog.css.js';

const UIStrings = {
  /**
  *@description Screen reader label for a select box that chooses the breakpoint type in the Sources panel when editing a breakpoint
  */
  breakpointType: 'Breakpoint type',
  /**
  *@description Text in Breakpoint Edit Dialog of the Sources panel
  */
  breakpoint: 'Breakpoint',
  /**
  *@description Text in Breakpoint Edit Dialog of the Sources panel
  */
  conditionalBreakpoint: 'Conditional breakpoint',
  /**
  *@description Text in Breakpoint Edit Dialog of the Sources panel
  */
  logpoint: 'Logpoint',
  /**
  *@description Text in Breakpoint Edit Dialog of the Sources panel
  */
  expressionToCheckBeforePausingEg: 'Expression to check before pausing, e.g. x > 5',
  /**
  *@description Type selector element title in Breakpoint Edit Dialog of the Sources panel
  */
  pauseOnlyWhenTheConditionIsTrue: 'Pause only when the condition is true',
  /**
  *@description Text in Breakpoint Edit Dialog of the Sources panel. It is used as
  *the placeholder for a text input field before the user enters text. Provides the user with
  *an example on how to use Logpoints. 'Log' is a verb and 'message' is a noun.
  *See: https://developer.chrome.com/blog/new-in-devtools-73/#logpoints
  */
  logMessageEgXIsX: 'Log message, e.g. `\'x is\', x`',
  /**
  *@description Type selector element title in Breakpoint Edit Dialog of the Sources panel
  */
  logAMessageToConsoleDoNotBreak: 'Log a message to Console, do not break',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/BreakpointEditDialog.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class BreakpointEditDialog extends UI.Widget.Widget {
  private readonly onFinish: (arg0: {
    committed: boolean,
    condition: string,
  }) => Promise<void>;
  private finished: boolean;
  private editor: TextEditor.TextEditor.TextEditor;
  private isLogpoint: boolean;
  private readonly typeSelector: UI.Toolbar.ToolbarComboBox;
  private placeholderCompartment: CodeMirror.Compartment;

  static async create(
      editorLineNumber: number,
      oldCondition: string,
      preferLogpoint: boolean,
      onFinish: (arg0: {committed: boolean, condition: string}) => Promise<void>,
      ): Promise<BreakpointEditDialog> {
    const TextEditor = await import('../../ui/components/text_editor/text_editor.js');
    const CodeMirror = await import('../../third_party/codemirror.next/codemirror.next.js');
    const editorConfig = [
      (await CodeMirror.javascript()).javascriptLanguage,
      TextEditor.Config.baseConfiguration(oldCondition || ''),
      CodeMirror.EditorView.lineWrapping,
      TextEditor.Config.showCompletionHint,
      await TextEditor.JavaScript.completion(),
      TextEditor.JavaScript.argumentHints(),
    ];
    return new BreakpointEditDialog(
        editorLineNumber, oldCondition, preferLogpoint, onFinish, TextEditor, CodeMirror, editorConfig);
  }

  constructor(
      editorLineNumber: number,
      oldCondition: string,
      preferLogpoint: boolean,
      onFinish: (arg0: {committed: boolean, condition: string}) => Promise<void>,
      modTextEditor: typeof TextEditor,
      readonly modCodeMirror: typeof CodeMirror,
      editorConfig: CodeMirror.Extension,
  ) {
    super(true);

    this.onFinish = onFinish;
    this.finished = false;
    this.element.tabIndex = -1;

    const logpointPrefix = LogpointPrefix;
    const logpointSuffix = LogpointSuffix;
    this.isLogpoint = oldCondition.startsWith(logpointPrefix) && oldCondition.endsWith(logpointSuffix);
    if (this.isLogpoint) {
      oldCondition = oldCondition.substring(logpointPrefix.length, oldCondition.length - logpointSuffix.length);
    }
    this.isLogpoint = this.isLogpoint || preferLogpoint;

    this.element.classList.add('sources-edit-breakpoint-dialog');
    const toolbar = new UI.Toolbar.Toolbar('source-frame-breakpoint-toolbar', this.contentElement);
    toolbar.appendText(`Line ${editorLineNumber + 1}:`);

    this.typeSelector =
        new UI.Toolbar.ToolbarComboBox(this.onTypeChanged.bind(this), i18nString(UIStrings.breakpointType));
    this.typeSelector.createOption(i18nString(UIStrings.breakpoint), BreakpointType.Breakpoint);
    const conditionalOption =
        this.typeSelector.createOption(i18nString(UIStrings.conditionalBreakpoint), BreakpointType.Conditional);
    const logpointOption = this.typeSelector.createOption(i18nString(UIStrings.logpoint), BreakpointType.Logpoint);
    this.typeSelector.select(this.isLogpoint ? logpointOption : conditionalOption);
    toolbar.appendToolbarItem(this.typeSelector);

    const content = oldCondition || '';
    const keymap = [
      {
        key: 'Mod-Enter',
        run: (view: CodeMirror.EditorView): boolean => {
          if (modTextEditor.JavaScript.isExpressionComplete(view.state)) {
            this.finishEditing(true, this.editor.state.doc.toString());
            return true;
          }
          return false;
        },
      },
      {
        key: 'Escape',
        run: (): boolean => {
          this.finishEditing(false, '');
          return true;
        },
      },
    ];

    this.placeholderCompartment = new modCodeMirror.Compartment();

    this.editor = new modTextEditor.TextEditor.TextEditor(modCodeMirror.EditorState.create({
      doc: content,
      selection: {anchor: 0, head: content.length},
      extensions: [
        this.placeholderCompartment.of(this.getPlaceholder()),
        modCodeMirror.keymap.of(keymap),
        editorConfig,
      ],
    }));
    this.editor.classList.add('condition-editor');

    this.updateTooltip();
    this.contentElement.appendChild(this.editor);
    this.element.addEventListener('blur', event => {
      if (!event.relatedTarget ||
          (event.relatedTarget && !(event.relatedTarget as Node).isSelfOrDescendant(this.element))) {
        this.finishEditing(true, this.editor.state.doc.toString());
      }
    }, true);
  }

  focusEditor(): void {
    this.editor.editor.focus();
  }
  private static conditionForLogpoint(condition: string): string {
    return `${LogpointPrefix}${condition}${LogpointSuffix}`;
  }

  private onTypeChanged(): void {
    const type = this.breakpointType;
    if (type === BreakpointType.Breakpoint) {
      this.finishEditing(true, '');
    } else {
      this.editor.editor.dispatch({effects: this.placeholderCompartment.reconfigure(this.getPlaceholder())});
      this.updateTooltip();
    }
  }

  private get breakpointType(): string|null {
    const option = this.typeSelector.selectedOption();
    return option ? option.value : null;
  }

  private getPlaceholder(): CodeMirror.Extension {
    const type = this.breakpointType;
    if (type === BreakpointType.Conditional) {
      return this.modCodeMirror.placeholder(i18nString(UIStrings.expressionToCheckBeforePausingEg));
    }
    if (type === BreakpointType.Logpoint) {
      return this.modCodeMirror.placeholder(i18nString(UIStrings.logMessageEgXIsX));
    }
    return [];
  }

  private updateTooltip(): void {
    const type = this.breakpointType;
    if (type === BreakpointType.Conditional) {
      UI.Tooltip.Tooltip.install((this.typeSelector.element), i18nString(UIStrings.pauseOnlyWhenTheConditionIsTrue));
    } else if (type === BreakpointType.Logpoint) {
      UI.Tooltip.Tooltip.install((this.typeSelector.element), i18nString(UIStrings.logAMessageToConsoleDoNotBreak));
    }
  }

  private finishEditing(committed: boolean, condition: string): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.editor.remove();
    if (this.isLogpoint) {
      condition = BreakpointEditDialog.conditionForLogpoint(condition);
    }
    this.onFinish({committed, condition});
  }

  wasShown(): void {
    super.wasShown();
    this.registerCSSFiles([breakpointEditDialogStyles]);
  }
}

export const LogpointPrefix = '/** DEVTOOLS_LOGPOINT */ console.log(';
export const LogpointSuffix = ')';

export const BreakpointType = {
  Breakpoint: 'Breakpoint',
  Conditional: 'Conditional',
  Logpoint: 'Logpoint',
};
