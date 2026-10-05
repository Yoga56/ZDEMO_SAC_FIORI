CLASS lhc_story DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR story RESULT result.

    METHODS checkname FOR VALIDATE ON SAVE
      IMPORTING keys FOR story~CheckName.
ENDCLASS.

CLASS lhc_story IMPLEMENTATION.

  METHOD get_global_authorizations.
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
