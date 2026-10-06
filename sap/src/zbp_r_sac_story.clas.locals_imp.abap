CLASS lhc_story DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR story RESULT result.

    METHODS setowner FOR DETERMINE ON MODIFY
      IMPORTING keys FOR story~SetOwner.

    METHODS checkname FOR VALIDATE ON SAVE
      IMPORTING keys FOR story~CheckName.
ENDCLASS.

CLASS lhc_story IMPLEMENTATION.

  " the owner changes and deletes; whoever the story was shared with for editing changes it; the others can only read it
  METHOD get_instance_authorizations.
    DATA may_edit TYPE abap_boolean.
    DATA may_delete TYPE abap_boolean.
    LOOP AT keys INTO DATA(key).
      may_edit = zcl_sac_access=>can_edit( kind = 'STORY' id = key-StoryId ).
      may_delete = zcl_sac_access=>can_delete( kind = 'STORY' id = key-StoryId ).
      APPEND VALUE #( %tky    = key-%tky
                %update = COND #( WHEN may_edit = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized )
                %delete = COND #( WHEN may_delete = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ) ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " a new story belongs to the user who creates it
  METHOD setowner.
    READ ENTITIES OF zr_sac_story IN LOCAL MODE
      ENTITY story
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(stories).
    DELETE stories WHERE OwnerId IS NOT INITIAL.
    CHECK stories IS NOT INITIAL.
    MODIFY ENTITIES OF zr_sac_story IN LOCAL MODE
      ENTITY story
        UPDATE FIELDS ( OwnerId )
        WITH VALUE #( FOR s IN stories ( %tky = s-%tky OwnerId = zcl_sac_access=>user( ) ) ).
  ENDMETHOD.


  METHOD checkname.
    READ ENTITIES OF zr_sac_story IN LOCAL MODE
      ENTITY story
        FIELDS ( StoryName ) WITH CORRESPONDING #( keys )
      RESULT DATA(stories).

    LOOP AT stories INTO DATA(story) WHERE StoryName IS INITIAL.
      APPEND VALUE #( %tky = story-%tky ) TO failed-story.
      APPEND VALUE #( %tky = story-%tky
                      %element-StoryName = if_abap_behv=>mk-on
                      %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                    text     = `A story needs a name` ) ) TO reported-story.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
