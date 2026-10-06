"! One-off: stories, models, data actions, multi actions and calendar events saved before sharing existed have no owner, so they are open to everyone. This gives each of them to
"! the user who created it (the creation user of the row), which is what the owner would have been. Rows without a creation user
"! (the sample content of ZCL_SAC_SEED) stay open. Run with F9 in ADT; it is safe to run again.
CLASS zcl_sac_claim_owners DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

ENDCLASS.



CLASS zcl_sac_claim_owners IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA stories      TYPE i.
    DATA models       TYPE i.
    DATA data_actions TYPE i.
    DATA multi_actions TYPE i.
    DATA events       TYPE i.

    SELECT story_id, created_by FROM zsac_story WHERE owner_id = @space AND created_by <> @space INTO TABLE @DATA(story_rows).
    LOOP AT story_rows INTO DATA(story).
      UPDATE zsac_story SET owner_id = @story-created_by WHERE story_id = @story-story_id.
      stories = stories + 1.
    ENDLOOP.

    SELECT model_id, created_by FROM zsac_model WHERE owner_id = @space AND created_by <> @space INTO TABLE @DATA(model_rows).
    LOOP AT model_rows INTO DATA(model).
      UPDATE zsac_model SET owner_id = @model-created_by WHERE model_id = @model-model_id.
      models = models + 1.
    ENDLOOP.

    SELECT action_id, created_by FROM zsac_dataact WHERE owner_id = @space AND created_by <> @space INTO TABLE @DATA(data_action_rows).
    LOOP AT data_action_rows INTO DATA(data_action).
      UPDATE zsac_dataact SET owner_id = @data_action-created_by WHERE action_id = @data_action-action_id.
      data_actions = data_actions + 1.
    ENDLOOP.

    SELECT action_id, created_by FROM zsac_multiact WHERE owner_id = @space AND created_by <> @space INTO TABLE @DATA(multi_action_rows).
    LOOP AT multi_action_rows INTO DATA(multi_action).
      UPDATE zsac_multiact SET owner_id = @multi_action-created_by WHERE action_id = @multi_action-action_id.
      multi_actions = multi_actions + 1.
    ENDLOOP.

    SELECT task_id, created_by FROM zsac_caltask WHERE owner_id = @space AND created_by <> @space INTO TABLE @DATA(event_rows).
    LOOP AT event_rows INTO DATA(event).
      UPDATE zsac_caltask SET owner_id = @event-created_by WHERE task_id = @event-task_id.
      events = events + 1.
    ENDLOOP.

    out->write( |{ stories } stories, { models } models, { data_actions } data actions, { multi_actions } multi actions and { events } calendar events now belong to the user who created them.| ).
  ENDMETHOD.

ENDCLASS.
