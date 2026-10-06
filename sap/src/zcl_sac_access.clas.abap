"! Who may open and edit a story, a model, a data action or a multi action. The owner has everything; anyone else has what the owner shared with
"! them (READ or WRITE) or with everyone ('*'). Content without an owner (older content, the sample data, owner '*')
"! belongs to nobody and is open to everyone to edit and delete, but cannot be shared.
"!
"! The shares are read from the table, not through the CDS views, so an access check never depends on the access control it serves.
CLASS zcl_sac_access DEFINITION PUBLIC FINAL CREATE PRIVATE.

  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF level,
        none  TYPE i VALUE 0,
        read  TYPE i VALUE 1,
        write TYPE i VALUE 2,
        owner TYPE i VALUE 3,
      END OF level.

    "! The user the request runs for, in capitals (user names are not case sensitive)
    CLASS-METHODS user
      RETURNING VALUE(result) TYPE zsac_story-owner_id.

    "! True when nobody owns the object (it does not exist, or its owner is empty or *). kind is STORY, MODEL, DATAACTION or MULTIACTION.
    CLASS-METHODS is_open
      IMPORTING kind          TYPE zsac_share-object_kind
                id            TYPE zsac_share-object_id
      RETURNING VALUE(result) TYPE abap_boolean.

    "! What the user may do with the object: level-none, level-read, level-write or level-owner
    CLASS-METHODS get_level
      IMPORTING kind          TYPE zsac_share-object_kind
                id            TYPE zsac_share-object_id
      RETURNING VALUE(result) TYPE i.

    CLASS-METHODS can_edit
      IMPORTING kind          TYPE zsac_share-object_kind
                id            TYPE zsac_share-object_id
      RETURNING VALUE(result) TYPE abap_boolean.

    "! The owner may delete; so may anyone when nobody owns the object
    CLASS-METHODS can_delete
      IMPORTING kind          TYPE zsac_share-object_kind
                id            TYPE zsac_share-object_id
      RETURNING VALUE(result) TYPE abap_boolean.

  PRIVATE SECTION.
    CLASS-METHODS owner_of
      IMPORTING kind          TYPE zsac_share-object_kind
                id            TYPE zsac_share-object_id
      RETURNING VALUE(result) TYPE zsac_story-owner_id.

ENDCLASS.



CLASS zcl_sac_access IMPLEMENTATION.

  METHOD user.
    result = to_upper( cl_abap_context_info=>get_user_technical_name( ) ).
  ENDMETHOD.


  METHOD owner_of.
    CASE kind.
      WHEN 'STORY'.
        SELECT SINGLE owner_id FROM zsac_story WHERE story_id = @id INTO @result.
      WHEN 'MODEL'.
        SELECT SINGLE owner_id FROM zsac_model WHERE model_id = @id INTO @result.
      WHEN 'DATAACTION'.
        SELECT SINGLE owner_id FROM zsac_dataact WHERE action_id = @id INTO @result.
      WHEN 'MULTIACTION'.
        SELECT SINGLE owner_id FROM zsac_multiact WHERE action_id = @id INTO @result.
    ENDCASE.
  ENDMETHOD.


  METHOD is_open.
    DATA(owner) = owner_of( kind = kind id = id ).
    result = xsdbool( owner IS INITIAL OR owner = '*' ).
  ENDMETHOD.


  METHOD get_level.
    DATA(owner) = owner_of( kind = kind id = id ).
    IF owner IS INITIAL OR owner = '*'.
      result = level-write.
      RETURN.
    ENDIF.

    DATA(me) = user( ).
    IF to_upper( owner ) = me.
      result = level-owner.
      RETURN.
    ENDIF.

    SELECT access_level FROM zsac_share
      WHERE object_kind = @kind AND object_id = @id AND ( principal = @me OR principal = '*' )
      INTO TABLE @DATA(grants).

    result = level-none.
    LOOP AT grants INTO DATA(grant).
      DATA(lvl) = COND i( WHEN grant-access_level = 'WRITE' THEN level-write
                          WHEN grant-access_level = 'READ'  THEN level-read
                          ELSE level-none ).
      IF lvl > result.
        result = lvl.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD can_edit.
    result = xsdbool( get_level( kind = kind id = id ) >= level-write ).
  ENDMETHOD.


  METHOD can_delete.
    result = xsdbool( is_open( kind = kind id = id ) = abap_true OR get_level( kind = kind id = id ) = level-owner ).
  ENDMETHOD.

ENDCLASS.
