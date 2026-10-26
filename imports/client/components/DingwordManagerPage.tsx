import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons/faChevronRight";
import { faEdit } from "@fortawesome/free-solid-svg-icons/faEdit";
import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  createOnDropHandler,
  dragAndDropFeature,
  expandAllFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  renamingFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import React, {
  type ComponentPropsWithRef,
  type FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import FormCheck from "react-bootstrap/FormCheck";
import FormControl from "react-bootstrap/FormControl";
import InputGroup from "react-bootstrap/InputGroup";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import buildDingwordTree from "../../lib/buildDingwordTree";
import isAdmin from "../../lib/isAdmin";
import { indexedById } from "../../lib/listUtils";
import Dingwords, {
  type DingwordFilteredType,
  type DingwordType,
} from "../../lib/models/Dingwords";
import settingsAll from "../../lib/publications/settingsAll";
import updateDingwords from "../../methods/updateDingwords";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import ActionButtonRow from "./ActionButtonRow";
import {
  EmptyState,
  ManagementCard,
  ManagementPage,
  PageHeader,
} from "./styling/ManagementPage";

enum SubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  ERROR = "failed",
}

const StyledButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  /* Precedence boost needed to override bootstrap default button padding */
  && {
    /* Resize button to fit in one line-height */
    display: block;
    height: 24px;
    width: 24px;
    padding: 0;
  }
`;

const DingwordButtons = styled.div`
  button {
    margin: 2px 0 2px 8px;
  }
`;
const DingwordTree = styled.div`
  margin-top: 20px;
  width: 100%;
`;
const Dragline = styled.div`
  height: 2px;
  margin-top: -1px;
  background-color: #00aff4;

  &&::before {
    content: "";
    position: absolute;
    left: 0;
    top: -3px;
    height: 4px;
    width: 4px;
    background: #fff;
    border: 2px solid #00aff4;
    border-radius: 99px;
  }
`;
const DingwordTreeNode = styled.div<{
  $drop: boolean;
}>`
  background: ${({ $drop, theme }) => ($drop ? theme.colors.dingwordTreeDropBackground : "inherit")};
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px 30px 30px 24px;
  align-items: center;
  min-height: 38px;

  &:hover {
    background: ${({ theme }) => theme.colors.dingwordTreeHoverBackground};
  }
`;
const TreeNodeIcon = styled.div<{
  $selected: boolean;
}>`
  width: 20px;
  color: #bbb;
  border-left: ${({ $selected }) => ($selected ? "2px solid #00aff4" : "none")};
`;

type DingwordNode = DingwordFilteredType & {
  dirty: boolean;
};
function makeDingwordTree(dingwords: Map<string, DingwordType>): {
  nodes: Map<string, DingwordNode>;
  root: string;
} {
  const normalized = buildDingwordTree(dingwords.values());
  const nodes = new Map(
    Array.from(normalized.nodes, ([key, value]) => [
      key,
      {
        _id: value._id,
        name: value.name,
        children: value.children ?? [],
        selectable: value.selectable ?? true,
        dirty:
          value.name === "__root__" &&
          JSON.stringify(value.children) !==
            JSON.stringify(dingwords.get(key)?.children),
      },
    ]),
  );
  return { nodes: nodes, root: normalized.rootNodeId };
}

const DingwordManagerPage = React.memo(() => {
  const { t } = useTranslation();
  useBreadcrumb({
    title: t("dingwords.manager.breadcrumbTitle", "Dingwords"),
    path: "/dingwords",
  });

  const loading = useTypedSubscribe(settingsAll);
  const canConfigure = useTracker(() => isAdmin(Meteor.user()), []);

  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");
  const [showEditError, setShowEditError] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>("");
  const [newName, setNewName] = useState("");
  const dismissSaveAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);
  const dismissEditAlert = useCallback(() => {
    setShowEditError(false);
  }, []);
  const shouldDisableForm = submitState === SubmitState.SUBMITTING;

  const [draftDingwords, setDraftDingwords] = useState<
    Map<string, DingwordNode>
  >(new Map());
  const [rootNodeId, setRootNodeId] = useState<string>("");
  const deletedDingwordIds = useRef<string[]>([]);

  const dingwordsLoading = useSubscribe("allDingwords")();
  const dingwords = useTracker(() => {
    return dingwordsLoading
      ? new Map<string, DingwordType>()
      : indexedById(Dingwords.find().fetch());
  }, [dingwordsLoading]);

  const tree = useTree<DingwordNode>({
    initialState: {},
    rootItemId: rootNodeId,
    isItemFolder: (_item) => true,
    getItemName: (item) => item.getItemData().name,
    canReorder: true,
    onDrop: createOnDropHandler((item, newChildren) => {
      const parentNode = draftDingwords.get(item.getId())!;
      parentNode.children = newChildren;
      parentNode.dirty = true;
      item.expand();
    }),
    onRename: (item, value) => {
      const name = value.trim();
      if (!name || name === "__root__") return;
      // check duplicates
      if (
        draftDingwords
          .values()
          .some(
            (v) =>
              v._id !== item.getId() &&
              v.name.toLowerCase() === name.toLowerCase(),
          )
      ) {
        setShowEditError(true);
        setEditError(
          t(
            "dingwords.manager.renameDuplicate",
            "Duplicate names of dingwords are not allowed.",
          ),
        );
        return;
      }
      item.getItemData().name = name;
      item.getItemData().dirty = true;
    },
    dataLoader: {
      getChildren: (itemId) => draftDingwords.get(itemId)?.children ?? [],
      getItem: (itemId) => draftDingwords.get(itemId)!,
    },
    indent: 20,
    features: [
      syncDataLoaderFeature,
      hotkeysCoreFeature,
      renamingFeature,
      selectionFeature,
      dragAndDropFeature,
      expandAllFeature,
    ],
  });

  useEffect(() => {
    if (!dingwordsLoading) {
      const { nodes, root } = makeDingwordTree(dingwords);
      setDraftDingwords(nodes);
      setRootNodeId(root);
      deletedDingwordIds.current = [];
    }
  }, [dingwordsLoading, dingwords]);

  useEffect(() => {
    void draftDingwords;
    tree.rebuildTree();
  }, [draftDingwords, tree]);

  const resetTree = useCallback(() => {
    const { nodes, root } = makeDingwordTree(dingwords);
    setDraftDingwords(nodes);
    setRootNodeId(root);
    deletedDingwordIds.current = [];
  }, [dingwords]);

  const expandAll = useCallback(() => {
    void tree.expandAll();
  }, [tree]);

  const saveDingwords = useCallback(() => {
    setSubmitState(SubmitState.SUBMITTING);
    const changedDingwords = Array.from(
      draftDingwords
        .values()
        .filter((dw) => dw.dirty)
        .map(({ dirty: _dirty, ...rest }) => rest),
    );
    updateDingwords.call(
      { changedDingwords, deletedDingwordIds: deletedDingwordIds.current },
      (error) => {
        if (error) {
          setSubmitError(error.message);
          setSubmitState(SubmitState.ERROR);
        } else {
          setSubmitState(SubmitState.SUCCESS);
        }
      },
    );
  }, [draftDingwords]);

  const addKeyword = (parentId = rootNodeId) => {
    const name = newName.trim();
    if (!name || name === "__root__") return;
    if (
      [...draftDingwords.values()].some(
        (word) => word.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setEditError(
        t(
          "dingwords.manager.renameDuplicate",
          "Duplicate names of dingwords are not allowed.",
        ),
      );
      setShowEditError(true);
      return;
    }
    const parent = draftDingwords.get(parentId);
    if (!parent) return;
    const id = Random.id();
    draftDingwords.set(id, {
      _id: id,
      name,
      children: [],
      selectable: true,
      dirty: true,
    });
    parent.children.push(id);
    parent.dirty = true;
    setDraftDingwords(new Map(draftDingwords));
    setNewName("");
    tree.getItemInstance(parentId).expand();
  };

  const changeSelectable = useCallback(
    (item: ItemInstance<DingwordNode>, checked: boolean) => {
      item.getItemData().selectable = checked;
      item.getItemData().dirty = true;
      tree.rebuildTree();
    },
    [tree],
  );

  const deleteDingword = useCallback(
    (item: ItemInstance<DingwordNode>) => {
      if (item.getChildren().length > 0) {
        setEditError(
          t(
            "dingwords.manager.cannotDeleteParentNodes",
            "Cannot delete nodes with children.",
          ),
        );
        setShowEditError(true);
        return;
      }
      const parent = item.getParent()?.getId();
      if (!parent) return;
      const parentDingword = draftDingwords.get(parent);
      if (!parentDingword) return;
      parentDingword.children = parentDingword.children?.filter(
        (id) => id !== item.getId(),
      );
      parentDingword.dirty = true;
      draftDingwords.delete(item.getId());
      deletedDingwordIds.current.push(item.getId());
      tree.rebuildTree();
    },
    [t, tree, draftDingwords],
  );

  const theme = useTheme();

  if (dingwordsLoading || loading()) {
    return <div>{t("common.loading", "loading")}...</div>;
  }

  if (!canConfigure) {
    return (
      <div>
        <h1>{t("common.notAuthorized", "Not authorized")}</h1>
      </div>
    );
  }

  return (
    <ManagementPage>
      <PageHeader>
        <h1>{t("dingwords.manager.title", "Dingword Manager")}</h1>
      </PageHeader>
      <ManagementCard>
        <div>
          {t(
            "dingwords.manager.operationIntro",
            "You can perform the following operations on dingwords:",
          )}
        </div>
        <ul>
          <li>
            {t(
              "dingwords.manager.reorgHelp",
              "Drag a dingword to reorder and modify hierachy",
            )}
          </li>
          <li>
            {t(
              "dingwords.manager.renameHelp",
              "Select a dingword and press F2 to rename",
            )}
          </li>
          <li>
            {t(
              "dingwords.manager.deleteHelp",
              "Delete a dingword (leaf nodes only)",
            )}
          </li>
          <li>
            {t(
              "dingwords.manager.selectHelp",
              'Use the checkbox to indicate whether a dingword is selectable (false is useful for category placeholders like "other")',
            )}
          </li>
        </ul>
        <InputGroup className="my-3">
          <FormControl
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
            placeholder={t("dingwords.newName", "Keyword name")}
            aria-label={t("dingwords.newName", "Keyword name")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addKeyword();
              }
            }}
          />
          <Button
            disabled={shouldDisableForm || !newName.trim()}
            onClick={() => addKeyword()}
          >
            <FontAwesomeIcon icon={faPlus} />{" "}
            {t("dingwords.add", "Add keyword")}
          </Button>
        </InputGroup>
        <ActionButtonRow>
          <DingwordButtons>
            <Button variant="secondary" onClick={expandAll}>
              {t("common.expandAll", "Expand all")}
            </Button>
            <Button variant="secondary" onClick={resetTree}>
              {t("common.reset", "Reset")}
            </Button>
            <Button disabled={shouldDisableForm} onClick={saveDingwords}>
              {t("common.save", "Save")}
            </Button>
          </DingwordButtons>
        </ActionButtonRow>

        {submitState === SubmitState.SUBMITTING ? (
          <Alert variant="info">{t("common.saving", "Saving")}...</Alert>
        ) : null}
        {submitState === SubmitState.SUCCESS ? (
          <Alert variant="success" dismissible onClose={dismissSaveAlert}>
            {t("common.saveSuccess", "Saved changes.")}
          </Alert>
        ) : null}
        {submitState === SubmitState.ERROR ? (
          <Alert variant="danger" dismissible onClose={dismissSaveAlert}>
            {t("common.saveFailed", "Saving failed")}: {submitError}
          </Alert>
        ) : null}

        {showEditError && (
          <Alert variant="danger" dismissible onClose={dismissEditAlert}>
            {editError}
          </Alert>
        )}

        <DingwordTree {...tree.getContainerProps()}>
          <AssistiveTreeDescription tree={tree} />
          {tree.getItems().length === 0 && (
            <EmptyState>
              {t(
                "dingwords.empty",
                "No keywords yet. Add a keyword to get started.",
              )}
            </EmptyState>
          )}
          {tree.getItems().map((item) => (
            <DingwordTreeNode
              key={item.getId()}
              $drop={item.isDragTarget()}
              // drop: item.isDragTarget(),
              style={{ paddingLeft: `${item.getItemMeta().level * 20}px` }}
            >
              <span {...item.getProps()} style={{ display: "flex" }}>
                <TreeNodeIcon $selected={item.isSelected()}>
                  {item.getItemData().children.length > 0 && (
                    <FontAwesomeIcon
                      icon={item.isExpanded() ? faChevronDown : faChevronRight}
                      size="xs"
                    />
                  )}
                </TreeNodeIcon>
                {item.isRenaming() ? (
                  <div
                    className="renaming-item"
                    style={{ marginLeft: `${item.getItemMeta().level * 20}px` }}
                  >
                    <input {...item.getRenameInputProps()} />
                  </div>
                ) : (
                  <span>{item.getItemName()}</span>
                )}
              </span>
              <StyledButton
                title={t(
                  "dingwords.addDingwordUnder",
                  "Add new dingword under {{parent}}",
                  { parent: item.getItemName() },
                )}
                disabled={!newName.trim() || shouldDisableForm}
                onClick={() => addKeyword(item.getId())}
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
              </StyledButton>
              <StyledButton
                title={t("dingwords.rename", "Rename keyword")}
                disabled={shouldDisableForm}
                onClick={() => item.startRenaming()}
              >
                <FontAwesomeIcon icon={faEdit} size="xs" />
              </StyledButton>
              <StyledButton
                onClick={() => deleteDingword(item)}
                size="sm"
                variant={theme.basicMode}
                title={t("dingwords.manager.delete", "Delete dingword")}
                disabled={shouldDisableForm}
              >
                <FontAwesomeIcon size="xs" icon={faMinus} />
              </StyledButton>
              <FormCheck
                type="checkbox"
                checked={item.getItemData().selectable}
                onChange={(event) =>
                  changeSelectable(item, event.currentTarget.checked)
                }
              />
            </DingwordTreeNode>
          ))}
          <Dragline style={tree.getDragLineStyle()} />
        </DingwordTree>
      </ManagementCard>
    </ManagementPage>
  );
});

export default DingwordManagerPage;
