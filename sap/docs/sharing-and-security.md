# Sharing and security of stories and models

## What a user can do

Every story and model has an **owner**, the user who created it. The owner shares it with named users or with everyone:

| Level | Can open and use | Can edit (and write plan data of a model) | Can delete and share |
|---|---|---|---|
| Owner | yes | yes | yes |
| Can edit (WRITE) | yes | yes | no |
| Can view (READ) | yes | no (the story opens in view mode, the Modeller cannot save) | no |
| No access | no (it is not listed in Stories, Datasets or Files, and cannot be opened) | no | no |

Content **without an owner** (the sample data, content saved before sharing existed, owner `*`) belongs to nobody: everyone can open, edit and delete it, and it cannot be shared. `ZCL_SAC_CLAIM_OWNERS` (F9) gives existing content to the user who created it.

A share is a row of `ZSAC_SHARE`: object kind (STORY or MODEL), object id, principal (a user name in capitals, or `*` for everyone) and READ or WRITE. A user who is shared with several ways (named and everyone) has the strongest. Editing a shared object never moves its ownership.

In the app: **Files** has a share button on stories and datasets and a *Shared with me* view; the story designer and the Modeller have a **Share** button (owner only) and say who shared the object with you.

## Where it is enforced

| Rule | Client (`zsac.lib`) | Mock provider | ABAP backend |
|---|---|---|---|
| Rules (`core/Access.js`) | yes | same code | `ZCL_SAC_ACCESS` (same rules) |
| Who may read a story, model or its file | lists and opens only what is allowed | refuses | access control `ZR_SAC_STORY`, `ZR_SAC_MODEL`, `ZR_SAC_FILE` |
| Widgets, dimensions, measures, versions, plan data and comments of an object a user cannot read | not requested | refuses | access controls that inherit the conditions of the story or model |
| Who may change or delete | buttons hidden, view mode | refuses | instance authorization in `ZBP_R_SAC_STORY` and `ZBP_R_SAC_MODEL` |
| Who may write plan data of a model | provider refuses | refuses | `WriteFacts` and `DeleteFacts` check the model (`ZBP_R_SAC_FACT`) |
| Who may share | owner only | refuses | instance authorization and validation `CheckShare` in `ZBP_R_SAC_SHARE` |
| Who sees the shares | owner: all; others: only rows about them or everyone | same | access control `ZR_SAC_SHARE` |

The client hides what the server would refuse, but the server is the protection: a user who calls the OData service directly meets the same rules.

## Not protected (known gaps)

* **Data actions, multi actions, calendar tasks, versions and cell comments are not owned.** Anyone with access to the service can change or delete them. Reading versions, plan data and comments follows the model, writing a version or a comment does not.
* **Plan data is written by actions and data actions that run in the browser.** The server checks the model on every write (above), but a data action is only as safe as the model it writes to.
* **Folders and the Files entry of data actions and multi actions are open**; only the files of stories and models follow the object.
* No groups or roles: a share names one user. There is no administrator who can read everything; an owner who leaves cannot be replaced except by changing `OWNER_ID` in the table.
* The sharing needs the user name of the logged-in user (`$session.user`); on a system with a technical user for all browsers everyone is that one user.

## Trying it without a backend

The mock provider plays another user with `?user=ALICE` in the URL (default `ME`). The sample data has *Board pack* (owned by ALICE, shared with ME for viewing) and *Alice private scenarios* (not shared): as ME the first opens read-only and the second is not listed; as ALICE both are listed and *Board pack* can be shared.

## Activating the ABAP

The access controls and the associations they use are the parts of this change that were written without a system, so they are the first things to check at activation. Activation order: table `ZSAC_SHARE`, `ZCL_SAC_ACCESS`, `ZR_SAC_SHARE`, the other `ZR_SAC_*` views, the access controls (`*.dcls`), the behavior definitions, `ZBP_R_SAC_*`, `ZC_SAC_*`, the service definition. Then run `ZCL_SAC_CLAIM_OWNERS` once.

If the system reports a problem in an access control, the app keeps working without that file (the data is then not filtered on the server for that entity); the points most likely to need a change:

1. `$session.user` inside an association condition (`_ShareMe` in `ZR_SAC_STORY`, `ZR_SAC_MODEL`, `ZR_SAC_FILE`). If it is refused, replace the association by a join in the view, or read the user name with `cl_abap_context_info` in an access control implemented as a *PFCG-free* custom role.
2. `where inheriting conditions from entity ...` in the access controls of widgets, dimensions, measures, versions, plan data and comments. If it is refused, write the conditions of `ZR_SAC_STORY` or `ZR_SAC_MODEL` out through the association `_Story`, `_Model`.
3. The read-only elements `CurrentUser` (`$session.user as CurrentUser`) in `ZR_SAC_STORY` and `ZR_SAC_MODEL`: the client takes the user name from them.
4. `authorization master ( instance )` with the `%assoc-_Widget` / `%assoc-_Dimension` / `%assoc-_Measure` entries in `get_instance_authorizations`.

After activation check, with two users A and B: A creates a story; B does not see it (Files, Stories, `GET /Story`); A shares it with B for viewing; B sees it and gets `403` on `PATCH`; A changes the share to editing; B can save; B cannot delete it or share it.
